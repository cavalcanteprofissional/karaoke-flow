import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { YoutubeSettingsCard } from "./youtube-settings-card";

/**
 * Fase 17 — o card "Busca de música (YouTube)" saiu do `room-settings.tsx` e
 * passou a viver em `/bar/[codigo]` (um card por sala do bar).
 *
 * Os textos são testados porque a versão anterior afirmava coisas falsas sobre
 * cota, e texto falso em tela de configuração custa mais que texto ausente: o
 * host lê, acredita e perde tempo configurando a coisa errada.
 */
const mocks = vi.hoisted(() => ({
  updateYoutubeKeyAction: vi.fn(),
  youtubeDisconnectAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rooms/actions", () => ({
  updateYoutubeKeyAction: (...args: unknown[]) =>
    mocks.updateYoutubeKeyAction(...args) as unknown,
  youtubeDisconnectAction: (...args: unknown[]) =>
    mocks.youtubeDisconnectAction(...args) as unknown,
}));

function renderCard(props: Partial<React.ComponentProps<typeof YoutubeSettingsCard>> = {}) {
  return render(
    <YoutubeSettingsCard
      roomId="room-1"
      roomCode="KARAOKE"
      apiKey={null}
      youtubeConnectedAt={null}
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("YoutubeSettingsCard — textos honestos sobre a busca no YouTube", () => {
  it("não promete cota por pessoa", () => {
    renderCard();

    expect(screen.queryByText(/cota do dia por usuário/i)).not.toBeInTheDocument();
    expect(screen.getByText(/a cota é desse/i)).toBeInTheDocument();
    expect(screen.getByText(/não existe cota por pessoa/i)).toBeInTheDocument();
  });

  it("não diz que conectar a conta tira a busca do seu projeto", () => {
    renderCard();

    expect(screen.queryByText(/sua cota/i)).not.toBeInTheDocument();
    expect(screen.getByText(/não cria uma cota separada/i)).toBeInTheDocument();
  });

  it("o botão diz 'conta do YouTube', não 'Google'", () => {
    renderCard();

    expect(
      screen.queryByRole("link", { name: /Conectar com o Google/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Conectar conta do YouTube/i })
    ).toBeInTheDocument();
  });

  it("o link de OAuth leva o código da sala", () => {
    renderCard({ roomCode: "ZEZE" });

    expect(screen.getByRole("link", { name: /Conectar conta do YouTube/i })).toHaveAttribute(
      "href",
      "/auth/youtube/authorize?room=ZEZE"
    );
  });

  it("a chave deixou de ser 'opcional'", () => {
    renderCard();

    expect(screen.queryByText(/Chave de API \(opcional\)/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Chave da YouTube Data API v3/i)).toBeInTheDocument();
  });

  it("explica onde criar a chave e o problema de restrição", () => {
    renderCard();

    expect(screen.getAllByText(/Google Cloud/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sem restrição/i)).toBeInTheDocument();
    expect(screen.getByText(/não envia Referer/i)).toBeInTheDocument();
  });
});

describe("YoutubeSettingsCard — chave salva", () => {
  it("com chave salva oferece remover, e remover grava null", async () => {
    mocks.updateYoutubeKeyAction.mockResolvedValue({ ok: true });
    renderCard({ apiKey: "chave-antiga" });

    fireEvent.click(screen.getByRole("button", { name: /Remover chave salva/i }));
    await vi.waitFor(() => expect(mocks.updateYoutubeKeyAction).toHaveBeenCalled());

    expect(mocks.updateYoutubeKeyAction).toHaveBeenCalledWith("room-1", null);
  });

  it("sem chave o botão remover não existe (não há o que tirar)", () => {
    renderCard({ apiKey: null });

    expect(screen.queryByRole("button", { name: /Remover chave salva/i })).toBeNull();
  });

  it("conta conectada mostra a data e o botão de desconectar", () => {
    renderCard({ youtubeConnectedAt: "2026-10-01T12:00:00.000Z" });

    expect(screen.getByText(/Conectado à conta do YouTube/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remover conexão/i })).toBeInTheDocument();
    // Sem conexão não há botão que pareça funcionar e não funciona.
    expect(
      screen.queryByRole("link", { name: /Conectar conta do YouTube/i })
    ).toBeNull();
  });
});
