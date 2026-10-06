import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { RoomSettings } from "./room-settings";

/**
 * O toggle de pré-aprovação de 24h é FUNCIONAL (o estado OFF existe, está no
 * banco e a regra respeita) mas nasce travado em ON por decisão do PO. Este
 * teste trava essa decisão: se alguém remover o `disabled` por engano, ele
 * falha.
 */
const mocks = vi.hoisted(() => ({
  updateRoomSettingsAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mocks.push(...args),
    refresh: (...args: unknown[]) => mocks.refresh(...args),
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rooms/actions", () => ({
  updateRoomSettingsAction: (...args: unknown[]) =>
    mocks.updateRoomSettingsAction(...args) as unknown,
  updateRoomCodeAction: vi.fn(),
  updateYoutubeKeyAction: vi.fn(),
  youtubeDisconnectAction: vi.fn(),
}));

const INITIAL = {
  entry_mode: "approval" as const,
  queue_approval_mode: "manual" as const,
  require_song_confirmation: false,
  pre_approval_24h: true,
  youtube_api_key: null,
};

function renderSettings() {
  return render(
    <RoomSettings
      roomId="room-1"
      roomCode="KARAOKE"
      initial={INITIAL}
      youtubeConnectedAt={null}
      bar={null}
    />
  );
}

beforeEach(() => {
  mocks.updateRoomSettingsAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoomSettings — pré-aprovação de 24h", () => {
  it("aparece esmaecida, ligada e travada, com a explicação do padrão", () => {
    renderSettings();

    const toggle = screen.getByLabelText(/Aprovação vale por 24h/) as HTMLButtonElement;
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute("data-state")).toBe("checked");
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText(/Quem tem login e foi aprovado nas últimas 24h/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Usuário sem login nunca é pré-aprovado/)
    ).toBeInTheDocument();
  });

  it("está junto dos outros toggles da sala", () => {
    renderSettings();

    expect(screen.getByLabelText(/Entrada livre/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Música com aprovação/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pedir confirmação do vídeo/)).toBeInTheDocument();
  });

  it("os outros toggles continuam gravando a pré-aprovação ligada junto", () => {
    renderSettings();

    fireEvent.click(screen.getByLabelText(/Entrada livre/));

    expect(mocks.updateRoomSettingsAction).toHaveBeenCalledWith("room-1", {
      entry_mode: "open",
      queue_approval_mode: "manual",
      require_song_confirmation: false,
      pre_approval_24h: true,
    });
  });
});

/**
 * Fase 8f — o texto do card de YouTube.
 *
 * Estes testes existem porque o texto antigo afirmava coisas falsas sobre cota, e
 * texto falso em tela de configuração custa mais que texto ausente: o host lê,
 * acredita, e perde tempo configuring a coisa errada (ou achando que conectar a
 * conta resolveu o problema de cota).
 */
describe("RoomSettings — textos honestos sobre a busca no YouTube", () => {
  it("não promete cota por pessoa", () => {
    renderSettings();

    expect(screen.queryByText(/cota do dia por usuário/i)).not.toBeInTheDocument();
    expect(screen.getByText(/a cota é desse/i)).toBeInTheDocument();
  });

  it("não diz que conectar a conta tira a busca do seu projeto", () => {
    renderSettings();

    expect(screen.queryByText(/sua cota/i)).not.toBeInTheDocument();
    expect(screen.getByText(/não cria uma cota separada/i)).toBeInTheDocument();
  });

  it("o botão diz 'conta do YouTube', não 'Google'", () => {
    renderSettings();

    // "Conectar com o Google" parecia o mesmo botão de login do app, que não
    // tem relação com a YouTube Data API.
    expect(
      screen.queryByRole("link", { name: /Conectar com o Google/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Conectar conta do YouTube/i })).toBeInTheDocument();
  });

  it("a chave deixou de ser 'opcional'", () => {
    renderSettings();

    expect(screen.queryByText(/Chave de API \(opcional\)/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Chave da YouTube Data API v3/i)).toBeInTheDocument();
  });

  // O passo que faltava: onde nasce a chave e por que restrição quebra o site.
  it("explica onde criar a chave e o problema de restrição", () => {
    renderSettings();

    // "Google Cloud" aparece no card (projeto da chave) e no passo (onde criar).
    expect(screen.getAllByText(/Google Cloud/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sem restrição/i)).toBeInTheDocument();
    expect(screen.getByText(/não envia Referer/i)).toBeInTheDocument();
  });
});
