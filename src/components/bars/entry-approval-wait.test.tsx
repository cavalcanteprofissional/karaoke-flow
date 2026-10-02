import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

type TestMembership = {
  status: "pending" | "approved" | "rejected";
  mesa_numero: number | null;
};

const mocks = vi.hoisted(() => {
  const router = {
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
  };
  const state: {
    membership: TestMembership | null;
    realtimeHandler?: () => void;
    lastCancelRoomId?: string;
    lastStateRoomCode?: string;
  } = {
    membership: { status: "pending", mesa_numero: 2 },
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => ({
    data: state.membership,
    error: null,
  }));

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockImplementation((...args: unknown[]) => {
    state.realtimeHandler = args[2] as () => void;
    return channel;
  });
  channel.subscribe.mockImplementation((callback: (status: string) => void) => {
    callback("SUBSCRIBED");
    return channel;
  });

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    from: vi.fn(() => query),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };

  const cancelEntryRequestActionMock = vi.fn(
    async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })
  );
  const cancelEntryRequestAction = (roomId: string) => {
    state.lastCancelRoomId = roomId;
    return cancelEntryRequestActionMock();
  };
  const getEntryRequestStateActionMock = vi.fn(
    async (): Promise<{ state: "cancelled" | "closed" | "pending" }> => ({
      state: "cancelled",
    })
  );
  const getEntryRequestStateAction = (roomCode: string) => {
    state.lastStateRoomCode = roomCode;
    return getEntryRequestStateActionMock();
  };
  const toast = { success: vi.fn(), error: vi.fn() };

  return {
    router,
    state,
    query,
    channel,
    supabase,
    cancelEntryRequestAction,
    cancelEntryRequestActionMock,
    getEntryRequestStateAction,
    getEntryRequestStateActionMock,
    toast,
  };
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

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

vi.mock("@/lib/rooms/actions", () => ({
  cancelEntryRequestAction: (roomId: string) => mocks.cancelEntryRequestAction(roomId),
}));

vi.mock("@/lib/bars/actions", () => ({
  getEntryRequestStateAction: (roomCode: string) =>
    mocks.getEntryRequestStateAction(roomCode),
}));

import { EntryApprovalWait } from "./entry-approval-wait";

const defaultProps = {
  roomId: "room-1",
  roomCode: "ABC123",
  barName: "Bar da Esquina",
  mesa: 2,
};

describe("EntryApprovalWait", () => {
  beforeEach(() => {
    mocks.router.replace.mockClear();
    mocks.router.refresh.mockClear();
    mocks.router.push.mockClear();
    mocks.state.membership = { status: "pending", mesa_numero: 2 };
    mocks.state.realtimeHandler = undefined;
    mocks.state.lastCancelRoomId = undefined;
    mocks.state.lastStateRoomCode = undefined;
    mocks.getEntryRequestStateActionMock.mockClear();
    mocks.getEntryRequestStateActionMock.mockResolvedValue({ state: "cancelled" });
    mocks.query.maybeSingle.mockClear();
    mocks.query.select.mockClear();
    mocks.query.eq.mockClear();
    mocks.supabase.from.mockClear();
    mocks.supabase.channel.mockClear();
    mocks.supabase.removeChannel.mockClear();
    mocks.cancelEntryRequestActionMock.mockClear();
    mocks.cancelEntryRequestActionMock.mockResolvedValue({ ok: true });
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("mostra o estado de espera com os dados do karaokê", async () => {
    render(<EntryApprovalWait {...defaultProps} />);

    expect(screen.getByText("Aguardando aprovação")).toBeInTheDocument();
    expect(screen.getByText("Seu pedido de entrada foi enviado")).toBeInTheDocument();
    expect(screen.getByText("Bar da Esquina")).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();
    await waitFor(() => expect(mocks.query.maybeSingle).toHaveBeenCalled());
  });

  it("redireciona para a sala quando o host aprova", async () => {
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = { status: "approved", mesa_numero: 2 };
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await waitFor(() => {
      // Default é `/salas/<código>`: é lá que ficam a escolha da mesa
      // (`MesaPicker`) e a busca. O player é só para quem entrou fora do raio,
      // e quem entra fora do raio passa o destino explicitamente.
      expect(mocks.router.replace).toHaveBeenCalledWith("/salas/ABC123");
    });
    expect(screen.getByText("Entrada aprovada!")).toBeInTheDocument();
  });

  it("usa o destino informado por quem chama (espectador fora do raio)", async () => {
    render(<EntryApprovalWait {...defaultProps} destination="/player/ABC123" />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = { status: "approved", mesa_numero: null };
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith("/player/ABC123")
    );
  });

  /**
   * Quem renderiza o card já está em `/salas/<código>`: o card aparece **dentro**
   * da página, junto com o `MesaPicker` e a busca. Na aprovação, o que tira o
   * card da tela é o `router.refresh()` do servidor (a linha deixa de ser
   * `pending`). Navegar para a própria URL seria recarregar a mesma página.
   */
  it("no modo refresh revalida em vez de trocar de rota", async () => {
    render(<EntryApprovalWait {...defaultProps} mode="refresh" />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = { status: "approved", mesa_numero: 2 };
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(screen.getByText(/entrada liberada para bar da esquina/i)).toBeInTheDocument();
  });

  it("não oferece link de fuga quando só revalida", async () => {
    vi.useFakeTimers();
    try {
      render(<EntryApprovalWait {...defaultProps} mode="refresh" initialStatus="approved" />);

      expect(mocks.router.refresh).toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      // O escape existe para uma navegação que não conclui; aqui não há
      // navegação para concluir.
      expect(screen.queryByRole("link", { name: /abrir o karaokê agora/i })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("não chama refresh ao aprovar: era o refresh que reiniciava o spinner", async () => {
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = { status: "approved", mesa_numero: 2 };
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalled());
    // `replace` + `refresh` juntos faziam o componente remontar e o latch de
    // "já finishou" se perder, voltando ao estado pending: spinner eterno.
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("oferece um link de fuga quando a navegação não conclui", async () => {
    vi.useFakeTimers();
    try {
      // `initialStatus="approved"` monta já aprovado: o efeito de mount chama
      // `finish()`, que navega e arma o timer. Isso isola o timer de escape do
      // Realtime.
      render(<EntryApprovalWait {...defaultProps} initialStatus="approved" />);

      expect(mocks.router.replace).toHaveBeenCalledWith("/salas/ABC123");
      expect(screen.queryByText("Abrir o karaokê agora")).not.toBeInTheDocument();

      // O `act` é obrigatório: `setNavStalled` roda dentro do callback do timer,
      // fora do ciclo de render, e sem o act o React agenda o update mas não o
      // aplica dentro do teste.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      // Um link real (<a href>), não router.replace: se o client router é
      // justamente o que travou, a navegação cheia não depende dele.
      const link = screen.getByRole("link", { name: /abrir o karaokê agora/i });
      expect(link).toHaveAttribute("href", "/salas/ABC123");
    } finally {
      vi.useRealTimers();
    }
  });

  it("permite tentar novamente depois de uma rejeição", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<EntryApprovalWait {...defaultProps} onRetry={onRetry} />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = { status: "rejected", mesa_numero: 2 };
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await screen.findByText("Seu pedido não foi aprovado");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it("limpa o canal Realtime ao sair da tela", async () => {
    const { unmount } = render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.supabase.channel).toHaveBeenCalled());

    unmount();
    expect(mocks.supabase.removeChannel).toHaveBeenCalled();
  });

  it("cancela o pedido e volta para a entrada depois de confirmar", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.query.maybeSingle).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));

    await waitFor(() => {
      expect(mocks.state.lastCancelRoomId).toBe("room-1");
      expect(mocks.router.replace).toHaveBeenCalledWith("/entrar?code=ABC123");
    });
    // Cancelar não precisa de refresh: a Server Action já rodou e a tela de
    // entrada lê o estado do banco no render. O refresh aqui só brigava com o
    // replace pela navegação.
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("não cancela nada quando o participante desiste da confirmação", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.query.maybeSingle).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));

    await waitFor(() => expect(mocks.router.replace).not.toHaveBeenCalled());
    expect(mocks.cancelEntryRequestActionMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("usa a rota de cancelamento informada (QR do bar com mesa)", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <EntryApprovalWait {...defaultProps} cancelHref="/entrar?bar=BARSEG&mesa=2" />
    );
    await waitFor(() => expect(mocks.query.maybeSingle).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith("/entrar?bar=BARSEG&mesa=2")
    );
    confirmSpy.mockRestore();
  });

  it("avisa quando o cancelamento falha", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.cancelEntryRequestActionMock.mockResolvedValue({
      ok: false,
      error: "Você não tem nenhum pedido aguardando aprovação.",
    });
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.query.maybeSingle).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));

    await waitFor(() => expect(mocks.cancelEntryRequestActionMock).toHaveBeenCalled());
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Você não tem nenhum pedido aguardando aprovação."
    );
    expect(screen.getByText("Aguardando aprovação")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("mostra 'pedido cancelado' quando a linha some e a sala continua ativa", async () => {
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = null;
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await screen.findByText("Pedido cancelado");
    expect(mocks.state.lastStateRoomCode).toBe("ABC123");
    expect(screen.queryByText("Esta sala foi encerrada")).not.toBeInTheDocument();
  });

  it("mostra 'sala encerrada' quando o servidor confirma o encerramento", async () => {
    mocks.getEntryRequestStateActionMock.mockResolvedValue({ state: "closed" });
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = null;
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await screen.findByText("Esta sala foi encerrada");
    expect(screen.queryByText("Pedido cancelado")).not.toBeInTheDocument();
  });
});
