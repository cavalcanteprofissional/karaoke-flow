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
