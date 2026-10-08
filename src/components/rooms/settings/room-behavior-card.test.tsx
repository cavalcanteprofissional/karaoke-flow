import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { RoomBehaviorCard } from "./room-behavior-card";

/**
 * Fase 17 — o card "Como a sala funciona" saiu do `room-settings.tsx` monolítico
 * e virou rota (`/salas/[codigo]/sala`). O que continua travado aqui é a decisão
 * do PO sobre a pré-aprovação de 24h: funcional no banco, mas nasce ligada e
 * desativada na UI — remover o `disabled` por engano tem que falhar o teste.
 */
const mocks = vi.hoisted(() => ({
  updateRoomSettingsAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rooms/actions", () => ({
  updateRoomSettingsAction: (...args: unknown[]) =>
    mocks.updateRoomSettingsAction(...args) as unknown,
}));

const INITIAL = {
  entry_mode: "approval" as const,
  queue_approval_mode: "manual" as const,
  require_song_confirmation: false,
  pre_approval_24h: true,
};

function renderCard() {
  return render(<RoomBehaviorCard roomId="room-1" initial={INITIAL} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoomBehaviorCard — pré-aprovação de 24h", () => {
  it("aparece esmaecida, ligada e travada, com a explicação do padrão", () => {
    renderCard();

    const toggle = screen.getByLabelText(/Aprovação vale por 24h/) as HTMLButtonElement;
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute("data-state")).toBe("checked");
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText(/Quem tem login e foi aprovado nas últimas 24h/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Usuário sem login nunca é pré-aprovado/)).toBeInTheDocument();
  });

  it("está junto dos outros toggles da sala", () => {
    renderCard();

    expect(screen.getByLabelText(/Entrada livre/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Música com aprovação/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pedir confirmação do vídeo/)).toBeInTheDocument();
  });

  it("os outros toggles continuam gravando a pré-aprovação ligada junto", async () => {
    mocks.updateRoomSettingsAction.mockResolvedValue({ ok: true });
    renderCard();

    fireEvent.click(screen.getByLabelText(/Entrada livre/));
    await vi.waitFor(() => expect(mocks.updateRoomSettingsAction).toHaveBeenCalled());

    expect(mocks.updateRoomSettingsAction).toHaveBeenCalledWith("room-1", {
      entry_mode: "open",
      queue_approval_mode: "manual",
      require_song_confirmation: false,
      pre_approval_24h: true,
    });
  });

  it("erro do servidor desfaz o toggle otimista", async () => {
    mocks.updateRoomSettingsAction.mockResolvedValue({
      ok: false,
      error: "Só o dono pode alterar as configurações da sala.",
    });
    renderCard();

    fireEvent.click(screen.getByLabelText(/Entrada livre/));

    // O card volta ao estado do servidor em vez de deixar a tela mentindo.
    await vi.waitFor(() =>
      expect(
        (screen.getByLabelText(/Entrada livre/) as HTMLButtonElement).getAttribute(
          "data-state"
        )
      ).toBe("unchecked")
    );
    expect(mocks.updateRoomSettingsAction).toHaveBeenCalled();
  });
});
