import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

type TestItem = {
  id: string;
  title: string;
  status: string;
  position: number;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  added_by_user_id: string;
  youtube_video_id: string;
};

const HOST_ID = "host-1";
const ROOM_ID = "room-1";
const ROOM_CODE = "KARAOKE";

const mocks = vi.hoisted(() => {
  const state: {
    items: TestItem[];
    names: { id: string; name: string }[];
    realtimeHandler?: () => void;
  } = { items: [], names: [] };

  const makeQuery = (getData: () => unknown[]) => {
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: getData(), error: null }).then(resolve),
    };
    return query;
  };

  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockImplementation((...args: unknown[]) => {
    state.realtimeHandler = args[2] as () => void;
    return channel;
  });
  channel.subscribe.mockImplementation((callback?: (status: string) => void) => {
    callback?.("SUBSCRIBED");
    return channel;
  });

  const supabase = {
    from: (table: string) =>
      table === "profiles_public" ? makeQuery(() => state.names) : makeQuery(() => state.items),
    channel: () => channel,
    removeChannel: vi.fn(),
  };

  return {
    state,
    supabase,
    setQueueItemStatusAction: vi.fn(),
    removeQueueItemAction: vi.fn(),
    reorderQueueAction: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toast.success(...args),
    error: (...args: unknown[]) => mocks.toast.error(...args),
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

vi.mock("@/lib/rooms/queue-actions", () => ({
  setQueueItemStatusAction: (itemId: string, decision: string) =>
    mocks.setQueueItemStatusAction(itemId, decision),
  removeQueueItemAction: (itemId: string) => mocks.removeQueueItemAction(itemId),
  reorderQueueAction: (roomId: string, itemIds: string[]) =>
    mocks.reorderQueueAction(roomId, itemIds),
}));

import { QueueList } from "./queue-list";
import type { QueueItem } from "./queue-list";

function item(over: Partial<TestItem> = {}): TestItem {
  return {
    id: "item-1",
    title: "Evidências",
    status: "pending",
    position: 1,
    duration_seconds: 240,
    thumbnail_url: null,
    added_by_user_id: "user-2",
    youtube_video_id: "abc123",
    ...over,
  };
}

function renderList(props: { isHost?: boolean; currentUserId?: string; initial?: QueueItem[] } = {}) {
  return render(
    <QueueList
      roomId={ROOM_ID}
      roomCode={ROOM_CODE}
      initial={(props.initial ?? mocks.state.items) as QueueItem[]}
      isHost={props.isHost ?? true}
      currentUserId={props.currentUserId ?? HOST_ID}
    />
  );
}

beforeEach(() => {
  mocks.state.items = [item()];
  mocks.state.names = [{ id: "user-2", name: "Ana" }];
  mocks.state.realtimeHandler = undefined;
  mocks.setQueueItemStatusAction.mockReset();
  mocks.removeQueueItemAction.mockReset();
  mocks.reorderQueueAction.mockReset();
  mocks.toast.error.mockReset();
  mocks.setQueueItemStatusAction.mockResolvedValue({
    ok: true,
    item: { id: "item-1", status: "approved" },
  });
  mocks.removeQueueItemAction.mockResolvedValue({ ok: true, itemId: "item-1" });
  mocks.reorderQueueAction.mockResolvedValue({ ok: true, itemIds: [] });
});

afterEach(() => {
  cleanup();
});

describe("QueueList — aprovação pelo host (Bloco A)", () => {
  it("mostra as pendentes num bloco próprio, com aprovar/rejeitar/remover", async () => {
    renderList();
    expect(
      await screen.findByRole("region", { name: "Aguardando sua aprovação" })
    ).toBeInTheDocument();
    expect(screen.getByText("Aguardando sua aprovação (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar Evidências" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rejeitar Evidências" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover Evidências" })).toBeInTheDocument();
  });

  it("aprova: chama a action com approved e a música passa para a fila", async () => {
    mocks.setQueueItemStatusAction.mockImplementation(async (itemId: string, decision: string) => {
      mocks.state.items = mocks.state.items.map((i) =>
        i.id === itemId ? { ...i, status: decision } : i
      );
      return { ok: true, item: { id: itemId, status: decision } };
    });
    renderList();
    await screen.findByRole("button", { name: "Aprovar Evidências" });

    fireEvent.click(screen.getByRole("button", { name: "Aprovar Evidências" }));

    expect(mocks.setQueueItemStatusAction).toHaveBeenCalledWith("item-1", "approved");
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Aguardando sua aprovação" })).toBeNull();
      expect(screen.getByText("na fila")).toBeInTheDocument();
    });
  });

  it("rejeita: chama a action com rejected e a música some da fila", async () => {
    mocks.setQueueItemStatusAction.mockImplementation(async (itemId: string, decision: string) => {
      if (decision === "rejected") {
        mocks.state.items = mocks.state.items.filter((i) => i.id !== itemId);
      }
      return { ok: true, item: { id: itemId, status: decision } };
    });
    renderList();
    await screen.findByRole("button", { name: "Rejeitar Evidências" });

    fireEvent.click(screen.getByRole("button", { name: "Rejeitar Evidências" }));

    expect(mocks.setQueueItemStatusAction).toHaveBeenCalledWith("item-1", "rejected");
    await waitFor(() => expect(screen.queryByText("Evidências")).toBeNull());
  });

  it("remove: apaga da lista na hora (otimista) e chama a action", async () => {
    let resolveAction: (value: unknown) => void = () => {};
    mocks.removeQueueItemAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        })
    );
    renderList();
    await screen.findByRole("button", { name: "Remover Evidências" });

    fireEvent.click(screen.getByRole("button", { name: "Remover Evidências" }));

    // Otimista: some antes da resposta do banco.
    expect(screen.queryByText("Evidências")).toBeNull();
    resolveAction({ ok: true, itemId: "item-1" });
    await waitFor(() => expect(mocks.removeQueueItemAction).toHaveBeenCalledWith("item-1"));
  });

  it("erro do banco: avisa e volta a mostrar a música (refetch)", async () => {
    mocks.setQueueItemStatusAction.mockResolvedValue({
      ok: false,
      error: "Só o dono da sala pode aprovar ou rejeitar músicas.",
      code: "RLS_BLOCKED",
    });
    renderList();
    await screen.findByRole("button", { name: "Aprovar Evidências" });

    fireEvent.click(screen.getByRole("button", { name: "Aprovar Evidências" }));

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Só o dono da sala pode aprovar ou rejeitar músicas.")
    );
    await waitFor(() => expect(screen.getByText("Evidências")).toBeInTheDocument());
  });

  it("não mostra o bloco de aprovação para quem não é o host", async () => {
    mocks.state.items = [item({ status: "approved" })];
    renderList({ isHost: false, currentUserId: "user-9" });
    await screen.findByText("Evidências");

    expect(screen.queryByRole("region", { name: "Aguardando sua aprovação" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remover Evidências" })).toBeNull();
    expect(screen.getByText(/Sua sala atualiza ao vivo/)).toBeInTheDocument();
  });

  it("participante vê o próprio pedido como 'aguardando aprovação', sem botões", async () => {
    mocks.state.items = [item({ added_by_user_id: "user-9" })];
    renderList({ isHost: false, currentUserId: "user-9" });
    expect(await screen.findByText("aguardando aprovação")).toBeInTheDocument();
    expect(screen.getByText("Evidências")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aprovar|Rejeitar|Remover/ })).toBeNull();
  });
});

describe("QueueList — feedback por estado (Bloco E)", () => {
  it("mostra quem pediu, e 'você' no próprio pedido", async () => {
    mocks.state.items = [item({ status: "approved", added_by_user_id: "user-2" })];
    renderList();
    expect(await screen.findByText(/pedido por Ana/)).toBeInTheDocument();

    cleanup();
    mocks.state.items = [item({ status: "approved", added_by_user_id: HOST_ID })];
    renderList();
    expect(await screen.findByText(/pedido por você/)).toBeInTheDocument();
  });

  it("distingue na fila de tocando agora", async () => {
    mocks.state.items = [item({ status: "playing", position: 1 })];
    renderList();
    expect(await screen.findByText("tocando agora")).toBeInTheDocument();
    expect(screen.queryByText("aguardando aprovação")).toBeNull();
  });

  it("formata a duração junto do autor", async () => {
    mocks.state.items = [item({ status: "approved", duration_seconds: 245 })];
    renderList();
    expect(await screen.findByText("4:05 · pedido por Ana")).toBeInTheDocument();
  });

  it("fila vazia mostra o convite para pedir", async () => {
    mocks.state.items = [];
    renderList({ isHost: false });
    expect(await screen.findByText(/A fila está vazia/)).toBeInTheDocument();
  });

  it("recarrega quando o realtime avisa mudança na fila", async () => {
    renderList();
    await screen.findByText("Evidências");
    expect(mocks.state.realtimeHandler).toBeTypeOf("function");

    mocks.state.items = [item({ status: "approved" })];
    fireEvent.click(document.body); // qualquer evento após o handler estar registrado
    mocks.state.realtimeHandler?.();

    await waitFor(() => expect(screen.getByText("na fila")).toBeInTheDocument());
  });
});
