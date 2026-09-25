import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  const state: { lastCancelledRoomId?: string } = {};
  const cancelEntryRequestActionMock = vi.fn(
    async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })
  );
  const cancelEntryRequestAction = (roomId: string) => {
    state.lastCancelledRoomId = roomId;
    return cancelEntryRequestActionMock();
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  return { router, state, cancelEntryRequestAction, cancelEntryRequestActionMock, toast };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toast.success(...args),
    error: (...args: unknown[]) => mocks.toast.error(...args),
  },
}));

vi.mock("@/lib/rooms/actions", () => ({
  cancelEntryRequestAction: (roomId: string) => mocks.cancelEntryRequestAction(roomId),
}));

import { PendingEntryRequests } from "./pending-entry-requests";

const requests = [
  {
    roomId: "room-1",
    roomCode: "BAR2FO",
    barName: "Bar da Esquina",
    barCode: "BARSEG",
    mesaNumero: 3,
    joinedAt: "2026-09-25T12:00:00.000Z",
  },
  {
    roomId: "room-2",
    roomCode: "KARAOKE",
    barName: "Karaokê do Zé",
    barCode: "ZEHBAR",
    mesaNumero: null,
    joinedAt: "2026-09-25T13:00:00.000Z",
  },
];

describe("PendingEntryRequests", () => {
  beforeEach(() => {
    mocks.router.push.mockClear();
    mocks.router.replace.mockClear();
    mocks.router.refresh.mockClear();
    mocks.state.lastCancelledRoomId = undefined;
    mocks.cancelEntryRequestActionMock.mockClear();
    mocks.cancelEntryRequestActionMock.mockResolvedValue({ ok: true });
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("não renderiza nada sem pedidos pendentes", () => {
    const { container } = render(<PendingEntryRequests requests={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lista os pedidos com bar, código e mesa", () => {
    render(<PendingEntryRequests requests={requests} />);

    expect(
      screen.getByText("Pedidos de entrada aguardando aprovação")
    ).toBeInTheDocument();
    expect(screen.getByText("Bar da Esquina")).toBeInTheDocument();
    expect(screen.getByText("BAR2FO")).toBeInTheDocument();
    expect(screen.getByText("Mesa 3")).toBeInTheDocument();
    expect(screen.getByText("Karaokê do Zé")).toBeInTheDocument();
    expect(screen.getByText("KARAOKE")).toBeInTheDocument();
  });

  it("leva à tela de espera com push + refresh ao acompanhar", () => {
    render(<PendingEntryRequests requests={requests} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Acompanhar aprovação" })[0]);

    expect(mocks.router.push).toHaveBeenCalledWith("/entrar?code=BAR2FO");
    expect(mocks.router.refresh).toHaveBeenCalled();
  });

  it("cancela o pedido escolhido após confirmar", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PendingEntryRequests requests={requests} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[1]);

    await waitFor(() => expect(mocks.state.lastCancelledRoomId).toBe("room-2"));
    expect(mocks.router.refresh).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith("Pedido cancelado.");
    confirmSpy.mockRestore();
  });

  it("mantém a lista quando o cancelamento falha", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.cancelEntryRequestActionMock.mockResolvedValue({
      ok: false,
      error: "Você não tem nenhum pedido aguardando aprovação.",
    });
    render(<PendingEntryRequests requests={requests} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Você não tem nenhum pedido aguardando aprovação."
      )
    );
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("Bar da Esquina")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
