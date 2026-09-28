import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PlaybackControls } from "./playback-controls";
import { FAKE_PLAYER_TOKEN, FAKE_ROTATED_PLAYER_TOKEN } from "@/test/fake-player-token";

/**
 * Painel de playback do host. O banco é a autoridade (a UI só convenience), mas
 * o que interessava aqui era: quem vê o quê, o que cada botão faz, o broadcast
 * para a TV depois de gravar, e o link com token girando.
 */
const mocks = vi.hoisted(() => ({
  setPlaybackAction: vi.fn(),
  rotatePlayerTokenAction: vi.fn(),
  announce: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/rooms/playback-actions", () => ({
  setPlaybackAction: (...args: unknown[]) => mocks.setPlaybackAction(...args) as unknown,
  rotatePlayerTokenAction: (...args: unknown[]) =>
    mocks.rotatePlayerTokenAction(...args) as unknown,
}));

vi.mock("@/lib/rooms/player-channel", () => ({
  announcePlaybackChange: (...args: unknown[]) => mocks.announce(...args) as unknown,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

const ROOM_ID = "room-1";
const ROOM_CODE = "KARAOKE";
const TOKEN = FAKE_PLAYER_TOKEN;
const NEW_TOKEN = FAKE_ROTATED_PLAYER_TOKEN;

const baseProps = {
  roomId: ROOM_ID,
  roomCode: ROOM_CODE,
  playerToken: TOKEN,
  status: "playing" as const,
  hasCurrent: true,
  queueLength: 3,
  isHost: true,
};

describe("PlaybackControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setPlaybackAction.mockResolvedValue({ ok: true });
    mocks.rotatePlayerTokenAction.mockResolvedValue({ ok: true, token: NEW_TOKEN });
    mocks.announce.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("não renderiza nada para quem não é o host", () => {
    const { container } = render(<PlaybackControls {...baseProps} isHost={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("monta o link da TV com o token de capacidade", () => {
    render(<PlaybackControls {...baseProps} />);
    const link = screen.getByRole("link", { name: /abrir player na tv/i });
    expect(link).toHaveAttribute("href", `/player/${ROOM_CODE}?token=${TOKEN}`);
  });

  it("pausando uma música tocando não anuncia nada quando o banco recusa", async () => {
    mocks.setPlaybackAction.mockResolvedValue({ ok: false, error: "sem permissão" });
    render(<PlaybackControls {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /pausar/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("sem permissão"));
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  it("grava no banco e avisa a TV por broadcast", async () => {
    render(<PlaybackControls {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /pular/i }));

    await waitFor(() =>
      expect(mocks.setPlaybackAction).toHaveBeenCalledWith(ROOM_ID, "skip")
    );
    await waitFor(() => expect(mocks.announce).toHaveBeenCalledWith(ROOM_CODE));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("não repete comando enquanto um está em andamento", async () => {
    const gate: { release?: (value: { ok: boolean }) => void } = {};
    mocks.setPlaybackAction.mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((r) => {
          gate.release = r;
        })
    );
    render(<PlaybackControls {...baseProps} />);

    const skip = screen.getByRole("button", { name: /pular/i });
    fireEvent.click(skip);
    fireEvent.click(skip);
    expect(mocks.setPlaybackAction).toHaveBeenCalledTimes(1);

    gate.release?.({ ok: true });
    await waitFor(() => expect(mocks.announce).toHaveBeenCalled());
  });

  it("pular e parar ficam desabilitados quando nada está tocando", () => {
    render(
      <PlaybackControls {...baseProps} status="idle" hasCurrent={false} queueLength={1} />
    );
    expect(screen.getByRole("button", { name: /pular/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /parar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /tocar/i })).toBeEnabled();
  });

  it("pausado, o botão principal volta a ser retomar e o pausar some", () => {
    render(<PlaybackControls {...baseProps} status="paused" />);
    expect(screen.getByRole("button", { name: /retomar/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /pausar/i })).not.toBeInTheDocument();
  });

  it("fila sem nada aprovado esconde tocar/pausar e diz por quê", () => {
    render(
      <PlaybackControls {...baseProps} status="idle" hasCurrent={false} queueLength={0} />
    );
    expect(screen.queryByRole("button", { name: /tocar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pausar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nenhuma música aprovada na fila/i)).toBeInTheDocument();
  });

  it("gerar novo link troca o token da URL e avisa que o antigo morreu", async () => {
    render(<PlaybackControls {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /gerar novo link/i }));

    await waitFor(() =>
      expect(mocks.rotatePlayerTokenAction).toHaveBeenCalledWith(ROOM_ID)
    );
    const link = await screen.findByRole("link", { name: /abrir player na tv/i });
    expect(link).toHaveAttribute("href", `/player/${ROOM_CODE}?token=${NEW_TOKEN}`);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("link antigo parou de funcionar")
    );
  });

  it("token inválido do banco não troca o link", async () => {
    mocks.rotatePlayerTokenAction.mockResolvedValue({ ok: false, error: "só o host" });
    render(<PlaybackControls {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /gerar novo link/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("só o host"));
    expect(screen.getByRole("link", { name: /abrir player na tv/i })).toHaveAttribute(
      "href",
      `/player/${ROOM_CODE}?token=${TOKEN}`
    );
  });

  it("copiar o link usa a URL absoluta e avisa", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<PlaybackControls {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /copiar link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain(`/player/${ROOM_CODE}?token=${TOKEN}`);
  });

  it("clipboard bloqueado explica o plano B em vez de quebrar", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("sem permissão")) },
      configurable: true,
    });
    render(<PlaybackControls {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /copiar link/i }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("barra"))
    );
  });
});
