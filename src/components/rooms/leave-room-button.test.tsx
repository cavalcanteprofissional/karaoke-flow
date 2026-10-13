import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { LeaveRoomButton } from "./leave-room-button";

/**
 * Item 2 da validação no aparelho: a pergunta de sair da sala precisava dizer a
 * consequência (sai da fila; para voltar, entra de novo — com aprovação se a
 * sala exigir). E cancelar não pode sair de fato.
 */
const mocks = vi.hoisted(() => ({
  leaveRoomAction: vi.fn(),
  announceMembersChange: vi.fn(),
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
  leaveRoomAction: (...args: unknown[]) => mocks.leaveRoomAction(...args) as unknown,
}));
vi.mock("@/lib/rooms/member-channel", () => ({
  announceMembersChange: (...args: unknown[]) =>
    mocks.announceMembersChange(...args) as unknown,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("LeaveRoomButton", () => {
  it("a confirmação diz a consequência de sair", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LeaveRoomButton roomId="room-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Sair da sala/i }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());

    expect(window.confirm).toHaveBeenCalledWith(
      "Sair desta sala? Você sai da fila e, para voltar, precisa entrar de novo — pedindo aprovação se a sala exigir."
    );
    expect(mocks.leaveRoomAction).not.toHaveBeenCalled();
  });

  it("cancelar não sai", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LeaveRoomButton roomId="room-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Sair da sala/i }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());

    expect(mocks.leaveRoomAction).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("confirmar sai e volta para o painel", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.leaveRoomAction.mockResolvedValue({ ok: true });
    render(<LeaveRoomButton roomId="room-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Sair da sala/i }));
    await waitFor(() => expect(mocks.leaveRoomAction).toHaveBeenCalledWith("room-1"));

    expect(toast.success).toHaveBeenCalled();
    // Sair apaga a linha de `room_members`: avisa o host antes de navegar.
    expect(mocks.announceMembersChange).toHaveBeenCalledWith("room-1");
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("erro da action mostra toast e não navega", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.leaveRoomAction.mockResolvedValue({ ok: false, error: "Sala não encontrada." });
    render(<LeaveRoomButton roomId="room-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Sair da sala/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sala não encontrada."));

    expect(mocks.announceMembersChange).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
