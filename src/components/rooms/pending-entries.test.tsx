import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const state: {
    members: { user_id: string; joined_at: string }[];
    names: { id: string; name: string }[];
    realtime?: () => void;
    unsubscribed?: boolean;
  } = { members: [], names: [], realtime: undefined, unsubscribed: undefined };

  const makeQuery = (getData: () => unknown[]) => {
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      in: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: getData(), error: null }).then(resolve),
    };
    return query;
  };

  const supabase = {
    from: vi.fn((table: string) =>
      table === "profiles_public"
        ? makeQuery(() => state.names)
        : makeQuery(() => state.members)
    ),
  };

  const subscribeToMemberChanges = vi.fn(
    (roomId: string, onChange: () => void, onStatus?: (status: string) => void) => {
      state.realtime = onChange;
      // O canal real avisa `SUBSCRIBED` quando sobe — é o callback que dispara a
      // primeira leitura (`load()` fora do corpo do efeito).
      onStatus?.("SUBSCRIBED");
      return () => {
        state.unsubscribed = true;
      };
    }
  );

  const decideEntryAction = vi.fn();
  const announceMembersChange = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };

  return {
    state,
    supabase,
    subscribeToMemberChanges,
    decideEntryAction,
    announceMembersChange,
    toast,
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

vi.mock("@/lib/rooms/actions", () => ({
  decideEntryAction: (roomId: string, userId: string, status: string) =>
    mocks.decideEntryAction(roomId, userId, status) as unknown,
}));

vi.mock("@/lib/rooms/member-channel", () => ({
  subscribeToMemberChanges: (
    roomId: string,
    onChange: () => void,
    onStatus?: (status: string) => void
  ) => mocks.subscribeToMemberChanges(roomId, onChange, onStatus),
  announceMembersChange: (roomId: string) =>
    mocks.announceMembersChange(roomId) as unknown,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toast.success(...args),
    error: (...args: unknown[]) => mocks.toast.error(...args),
  },
}));

import { PendingEntries } from "./pending-entries";

const doisPendentes = [
  { user_id: "user-1", joined_at: "2026-09-25T12:00:00.000Z" },
  { user_id: "user-2", joined_at: "2026-09-25T13:00:00.000Z" },
];

const doisNomes = [
  { id: "user-1", name: "Ana" },
  { id: "user-2", name: "Bruno" },
];

beforeEach(() => {
  mocks.state.members = doisPendentes;
  mocks.state.names = doisNomes;
  mocks.state.realtime = undefined;
  mocks.state.unsubscribed = undefined;
  mocks.supabase.from.mockClear();
  mocks.subscribeToMemberChanges.mockClear();
  mocks.decideEntryAction.mockReset();
  mocks.decideEntryAction.mockResolvedValue({ ok: true });
  mocks.announceMembersChange.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PendingEntries", () => {
  it("lista os pedidos pendentes com o nome de quem pediu", async () => {
    render(<PendingEntries roomId="room-1" initial={[]} />);

    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
  });

  it("mostra o convite quando não há nenhum pedido", async () => {
    mocks.state.members = [];
    render(<PendingEntries roomId="room-1" initial={[]} />);

    expect(
      await screen.findByText("Nenhum pedido aguardando aprovação.")
    ).toBeInTheDocument();
  });

  it("relê quando o broadcast da sala avisa que algo mudou", async () => {
    render(<PendingEntries roomId="room-1" initial={[]} />);
    await screen.findByText("Ana");

    mocks.state.members = [{ user_id: "user-3", joined_at: "2026-09-25T14:00:00.000Z" }];
    mocks.state.names = [{ id: "user-3", name: "Carla" }];
    act(() => {
      mocks.state.realtime?.();
    });

    expect(await screen.findByText("Carla")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Ana")).not.toBeInTheDocument());
  });

  it("aprova o pedido, tira da lista e avisa a sala", async () => {
    render(<PendingEntries roomId="room-1" initial={[]} />);
    await screen.findByText("Ana");

    fireEvent.click(screen.getByRole("button", { name: "Aprovar Ana" }));

    await waitFor(() =>
      expect(mocks.decideEntryAction).toHaveBeenCalledWith("room-1", "user-1", "approved")
    );
    await waitFor(() => expect(screen.queryByText("Ana")).not.toBeInTheDocument());
    // Aprovar muda `room_members`: quem espera aprovação precisa ser avisado.
    expect(mocks.announceMembersChange).toHaveBeenCalledWith("room-1");
  });

  it("rejeita o pedido, tira da lista e avisa a sala", async () => {
    render(<PendingEntries roomId="room-1" initial={[]} />);
    await screen.findByText("Bruno");

    fireEvent.click(screen.getByRole("button", { name: "Rejeitar Bruno" }));

    await waitFor(() =>
      expect(mocks.decideEntryAction).toHaveBeenCalledWith("room-1", "user-2", "rejected")
    );
    await waitFor(() => expect(screen.queryByText("Bruno")).not.toBeInTheDocument());
    expect(mocks.announceMembersChange).toHaveBeenCalledWith("room-1");
  });

  it("mantém a lista e avisa quando a ação falha", async () => {
    mocks.decideEntryAction.mockResolvedValue({ ok: false, error: "sem permissão" });
    render(<PendingEntries roomId="room-1" initial={[]} />);
    await screen.findByText("Ana");

    fireEvent.click(screen.getByRole("button", { name: "Aprovar Ana" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("sem permissão"));
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(mocks.announceMembersChange).not.toHaveBeenCalled();
  });

  it("assina o canal broadcast da sala e desliga ao sair", async () => {
    const { unmount } = render(<PendingEntries roomId="room-1" initial={[]} />);
    await waitFor(() =>
      expect(mocks.subscribeToMemberChanges).toHaveBeenCalledWith(
        "room-1",
        expect.any(Function),
        expect.any(Function)
      )
    );

    unmount();
    expect(mocks.state.unsubscribed).toBe(true);
  });

  it("reconsulta pelo poll de 10s quando o realtime não avisa", async () => {
    vi.useFakeTimers();
    try {
      render(<PendingEntries roomId="room-1" initial={[]} />);
      // A primeira leitura vem no `SUBSCRIBED`; resolve no próximo flush.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const inicial = mocks.supabase.from.mock.calls.length;

      // Sem o poll, nenhuma leitura nova sairia (o broadcast ficou mudo).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mocks.supabase.from.mock.calls.length).toBeGreaterThan(inicial);
    } finally {
      vi.useRealTimers();
    }
  });
});
