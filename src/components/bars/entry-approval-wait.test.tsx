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
    membership: TestMembership;
    realtimeHandler?: () => void;
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

  return { router, state, query, channel, supabase };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
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
    mocks.query.maybeSingle.mockClear();
    mocks.query.select.mockClear();
    mocks.query.eq.mockClear();
    mocks.supabase.from.mockClear();
    mocks.supabase.channel.mockClear();
    mocks.supabase.removeChannel.mockClear();
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

  it("redireciona automaticamente quando o host aprova", async () => {
    render(<EntryApprovalWait {...defaultProps} />);
    await waitFor(() => expect(mocks.state.realtimeHandler).toBeDefined());

    mocks.state.membership = { status: "approved", mesa_numero: 2 };
    act(() => {
      mocks.state.realtimeHandler?.();
    });

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/salas/ABC123");
      expect(mocks.router.refresh).toHaveBeenCalled();
    });
    expect(screen.getByText("Entrada aprovada!")).toBeInTheDocument();
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
});
