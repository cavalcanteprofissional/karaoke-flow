import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
    /** Handlers e status do canal da sala (`room-queue-<código>`). */
    queueSubscribe: {
      roomCode: string;
      onChange: () => void;
      onStatus?: (status: string) => void;
      unsubscribe: ReturnType<typeof vi.fn>;
    }[];
  } = { items: [], names: [], queueSubscribe: [] };

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
      table === "profiles_public"
        ? makeQuery(() => state.names)
        : makeQuery(() => state.items),
    channel: () => channel,
    removeChannel: vi.fn(),
  };

  return {
    state,
    supabase,
    setQueueItemStatusAction: vi.fn(),
    removeQueueItemAction: vi.fn(),
    reorderQueueAction: vi.fn(),
    announceQueueChange: vi.fn(),
    announcePlaybackChange: vi.fn(),
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

// O canal da sala e o aviso de playback são um eventinho sem dado: quem entra
// aqui só precisa de poderprovocar o handler e conferir quem foi avisado.
vi.mock("@/lib/rooms/room-channel", () => ({
  subscribeToQueueChanges: (
    roomCode: string,
    onChange: () => void,
    onStatus?: (status: string) => void
  ) => {
    const unsubscribe = vi.fn();
    mocks.state.queueSubscribe.push({ roomCode, onChange, onStatus, unsubscribe });
    return unsubscribe;
  },
  announceQueueChange: (roomCode: string) =>
    mocks.announceQueueChange(roomCode) as unknown,
}));

vi.mock("@/lib/rooms/player-channel", () => ({
  announcePlaybackChange: (roomCode: string) =>
    mocks.announcePlaybackChange(roomCode) as unknown,
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

function renderList(
  props: { isHost?: boolean; currentUserId?: string; initial?: QueueItem[] } = {}
) {
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
  mocks.state.queueSubscribe = [];
  mocks.setQueueItemStatusAction.mockReset();
  mocks.removeQueueItemAction.mockReset();
  mocks.reorderQueueAction.mockReset();
  mocks.announceQueueChange.mockReset();
  mocks.announcePlaybackChange.mockReset();
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
    expect(
      screen.getByRole("button", { name: "Aprovar Evidências" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rejeitar Evidências" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remover Evidências" })
    ).toBeInTheDocument();
  });

  it("aprova: chama a action com approved e a música passa para a fila", async () => {
    mocks.setQueueItemStatusAction.mockImplementation(
      async (itemId: string, decision: string) => {
        mocks.state.items = mocks.state.items.map((i) =>
          i.id === itemId ? { ...i, status: decision } : i
        );
        return { ok: true, item: { id: itemId, status: decision } };
      }
    );
    renderList();
    await screen.findByRole("button", { name: "Aprovar Evidências" });

    fireEvent.click(screen.getByRole("button", { name: "Aprovar Evidências" }));

    expect(mocks.setQueueItemStatusAction).toHaveBeenCalledWith("item-1", "approved");
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Aguardando sua aprovação" })
      ).toBeNull();
      expect(screen.getByText("na fila")).toBeInTheDocument();
    });
  });

  it("rejeita: chama a action com rejected e a música some da fila", async () => {
    mocks.setQueueItemStatusAction.mockImplementation(
      async (itemId: string, decision: string) => {
        if (decision === "rejected") {
          mocks.state.items = mocks.state.items.filter((i) => i.id !== itemId);
        }
        return { ok: true, item: { id: itemId, status: decision } };
      }
    );
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
    await waitFor(() =>
      expect(mocks.removeQueueItemAction).toHaveBeenCalledWith("item-1")
    );
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
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Só o dono da sala pode aprovar ou rejeitar músicas."
      )
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

describe("QueueList — reordenação da fila (Bloco C)", () => {
  const A = "aaaaaaaa-0000-0000-0000-000000000001";
  const B = "bbbbbbbb-0000-0000-0000-000000000002";
  const C = "cccccccc-0000-0000-0000-000000000003";

  function queue() {
    return [
      item({
        id: A,
        title: "A",
        status: "playing",
        position: 1,
        added_by_user_id: "user-2",
      }),
      item({
        id: B,
        title: "B",
        status: "approved",
        position: 2,
        added_by_user_id: "user-2",
      }),
      item({
        id: C,
        title: "C",
        status: "approved",
        position: 3,
        added_by_user_id: "user-2",
      }),
    ];
  }

  beforeEach(() => {
    mocks.state.items = queue();
    mocks.state.names = [{ id: "user-2", name: "Ana" }];
  });

  it("manda a fila inteira: tocando fixo, aprovadas na nova ordem e pendentes no fim", async () => {
    renderList();
    const down = await screen.findByRole("button", { name: "Descer B" });
    fireEvent.click(down);

    await waitFor(() => expect(mocks.reorderQueueAction).toHaveBeenCalledTimes(1));
    // "tocando" não é reordenável: fica no topo e não entra no payload de ordem.
    expect(mocks.reorderQueueAction).toHaveBeenCalledWith(ROOM_ID, [A, C, B]);
  });

  it("desabilita a primeira seta para cima e a última para baixo", async () => {
    renderList();
    expect(await screen.findByRole("button", { name: "Subir B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer C" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer B" })).toBeEnabled();
  });

  it("não toca no banco quando a seta está na borda", async () => {
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Descer C" }));
    expect(mocks.reorderQueueAction).not.toHaveBeenCalled();
  });

  it("reconcilia a fila real quando o banco recusa a nova ordem", async () => {
    mocks.reorderQueueAction.mockResolvedValue({
      ok: false,
      error: "A fila mudou enquanto você reordenava — tentando de novo.",
      code: "STALE_QUEUE",
    });
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Descer B" }));

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        expect.stringContaining("A fila mudou enquanto você reordenava")
      )
    );
    // volta para a ordem do banco (refetch), sem estado otimista preso.
    await waitFor(() => {
      const titles = screen.getAllByText(/^[ABC]$/).map((el) => el.textContent);
      expect(titles).toEqual(["A", "B", "C"]);
    });
  });

  it("não oferece reordenação para o participante", async () => {
    renderList({ isHost: false });
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Subir|Descer) / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reordenar / })).toBeNull();
  });

  it("mantém o item em reprodução fora das setas", async () => {
    renderList();
    expect(await screen.findByRole("button", { name: "Remover A" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^(Subir|Descer|Reordenar) A$/ })
    ).toBeNull();
  });

  it("oferece handle de arrasto com nome acessível", async () => {
    renderList();
    expect(
      await screen.findByRole("button", { name: "Reordenar B" })
    ).toBeInTheDocument();
  });
});

describe("QueueList — trocar música (Bloco D)", () => {
  const A = "aaaaaaaa-0000-0000-0000-000000000001";
  const B = "bbbbbbbb-0000-0000-0000-000000000002";

  beforeEach(() => {
    mocks.state.items = [
      item({
        id: A,
        title: "A",
        status: "approved",
        position: 1,
        added_by_user_id: "user-2",
      }),
      item({
        id: B,
        title: "B",
        status: "pending",
        position: 2,
        added_by_user_id: "user-9",
      }),
    ];
    mocks.state.names = [{ id: "user-2", name: "Ana" }];
  });

  it("o autor recebe o link de troca apontando para o item", async () => {
    renderList({ isHost: false, currentUserId: "user-2" });
    const link = await screen.findByRole("link", { name: "Trocar A" });
    expect(link).toHaveAttribute("href", `/salas/${ROOM_CODE}/buscar?trocar=${A}`);
  });

  it("quem não pediu a música não vê o link de troca, mas pode tirar o próprio pedido", async () => {
    mocks.state.items = [
      item({
        id: A,
        title: "A",
        status: "approved",
        position: 1,
        added_by_user_id: "user-2",
      }),
      item({
        id: B,
        title: "B",
        status: "pending",
        position: 2,
        added_by_user_id: "user-5",
      }),
    ];
    renderList({ isHost: false, currentUserId: "user-5" });
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trocar A" })).toBeNull();
    expect(screen.getByRole("link", { name: "Trocar B" })).toHaveAttribute(
      "href",
      `/salas/${ROOM_CODE}/buscar?trocar=${B}`
    );
    expect(screen.getByRole("button", { name: /Tirar da fila/ })).toBeInTheDocument();
  });

  it("o host troca qualquer música, até a de outra pessoa", async () => {
    renderList({ isHost: true, currentUserId: HOST_ID });
    expect(await screen.findByRole("link", { name: "Trocar A" })).toHaveAttribute(
      "href",
      `/salas/${ROOM_CODE}/buscar?trocar=${A}`
    );
  });

  it("não oferece troca para o que já está tocando", async () => {
    mocks.state.items = [
      item({
        id: A,
        title: "A",
        status: "playing",
        position: 1,
        added_by_user_id: "user-2",
      }),
    ];
    renderList({ isHost: false, currentUserId: "user-2" });
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trocar A" })).toBeNull();
  });
});

/**
 * A lista do participante parava de atualizar e o código não dizia por quê
 * (2026-09-27). São três causas independentes, e por isso a correção é
 * redundância: broadcast de quem mutou (não depende de RLS nem da publicação do
 * realtime), poll de 10s e relê quando a tela volta a ficar visível.
 */
describe("QueueList — a lista volta a atualizar sozinha (2026-09-27)", () => {
  it("assina o canal da sala, não só o postgres_changes", async () => {
    renderList();
    await screen.findByText("Evidências");

    expect(mocks.state.queueSubscribe).toHaveLength(1);
    expect(mocks.state.queueSubscribe[0].roomCode).toBe(ROOM_CODE);
  });

  it("relê a fila quando o aviso de quem aprovou chega", async () => {
    renderList({ isHost: false, currentUserId: "user-9" });
    await screen.findByText("Evidências");

    // O banco mudou: o host aprovou, o participante ainda vê "aguardando".
    mocks.state.items = [item({ status: "approved" })];
    await act(async () => {
      mocks.state.queueSubscribe[0].onChange();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText("na fila")).toBeInTheDocument());
  });

  it("aprovar avisa a TV e a sala", async () => {
    renderList();
    await screen.findByRole("button", { name: "Aprovar Evidências" });

    fireEvent.click(screen.getByRole("button", { name: "Aprovar Evidências" }));

    // A TV pode estar ociosa e precisa puxar a próxima; os aparelhos da sala
    // precisam ver a música entrar na fila.
    await waitFor(() =>
      expect(mocks.announcePlaybackChange).toHaveBeenCalledWith(ROOM_CODE)
    );
    await waitFor(() =>
      expect(mocks.announceQueueChange).toHaveBeenCalledWith(ROOM_CODE)
    );
  });

  it("o poll de 10s relê mesmo sem realtime nenhum", async () => {
    vi.useFakeTimers();
    try {
      renderList({ isHost: false, currentUserId: "user-9" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("aguardando aprovação")).toBeInTheDocument();

      // Nenhum evento de realtime: só o tempo passando.
      mocks.state.items = [item({ status: "approved" })];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(screen.getByText("na fila")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("relê quando a tela volta a ficar visível (o caso real: celular travado)", async () => {
    renderList({ isHost: false, currentUserId: "user-9" });
    await screen.findByText("Evidências");

    mocks.state.items = [item({ status: "approved" })];
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText("na fila")).toBeInTheDocument());
  });

  it("assinatura quebrada aparece no console (falha silenciosa custa caro)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      renderList();
      await screen.findByText("Evidências");

      mocks.state.queueSubscribe[0].onStatus?.("CHANNEL_ERROR");

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("CHANNEL_ERROR"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("10s"));
    } finally {
      warn.mockRestore();
    }
  });

  it("desmontar cancela o canal e os listeners", async () => {
    const { unmount } = renderList();
    await screen.findByText("Evidências");

    unmount();

    expect(mocks.state.queueSubscribe[0].unsubscribe).toHaveBeenCalledTimes(1);
  });
});
