import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { RoomCodeCard } from "./room-code-card";

/**
 * Fase 17 — "Código de entrada" saiu do `room-settings.tsx` e mora em
 * `/salas/[codigo]/sala`. Depois de trocar, a rota ANTIGA deixa de existir,
 * então a navegação para `/salas/<novo>/sala` é parte do contrato: quem
 * ficasse no código velho veria "sala não encontrada".
 */
const mocks = vi.hoisted(() => ({
  updateRoomCodeAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mocks.push(...args),
    refresh: (...args: unknown[]) => mocks.refresh(...args),
  }),
}));
vi.mock("@/lib/rooms/actions", () => ({
  updateRoomCodeAction: (...args: unknown[]) =>
    mocks.updateRoomCodeAction(...args) as unknown,
}));

function renderCard(roomCode = "KARAOKE") {
  return render(<RoomCodeCard roomId="room-1" roomCode={roomCode} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoomCodeCard", () => {
  it("começa com o código atual e o botão salvar desabilitado", () => {
    renderCard();

    expect(screen.getByRole("textbox")).toHaveValue("KARAOKE");
    expect(screen.getByRole("button", { name: /Salvar/i })).toBeDisabled();
  });

  it("digitação é forçada a maiúsculas sem acento/espaço automático", () => {
    renderCard();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ze Ze" } });
    expect(screen.getByRole("textbox")).toHaveValue("ZE ZE");
  });

  it("troca o código e navega para a rota nova", async () => {
    mocks.updateRoomCodeAction.mockResolvedValue({ ok: true, newCode: "ZEZE" });
    renderCard();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ZEZE" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mocks.updateRoomCodeAction).toHaveBeenCalledWith("room-1", "ZEZE"));

    expect(mocks.push).toHaveBeenCalledWith("/salas/ZEZE/sala");
    expect(mocks.refresh).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("recusa do servidor não navega", async () => {
    mocks.updateRoomCodeAction.mockResolvedValue({
      ok: false,
      error: "Este código já pertence a outro karaokê ou bar. Escolha outro.",
    });
    renderCard();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "EXTRA" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mocks.updateRoomCodeAction).toHaveBeenCalled());

    expect(mocks.push).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Este código já pertence a outro karaokê ou bar. Escolha outro."
    );
  });
});
