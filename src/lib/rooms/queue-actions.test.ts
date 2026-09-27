import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  removeQueueItemAction,
  replaceQueueSongAction,
  setQueueItemStatusAction,
} from "./queue-actions";

/**
 * As actions de moderação da fila (Fase 8a).
 *
 * O bug que estes testes travam: a pré-leitura usava `rooms!inner(...)` SEM o
 * nome da FK. Depois da Fase 6 (`rooms.current_item_id → queue_items.id`) a
 * relação ficou ambígua, o PostgREST respondeu PGRST201 e a action — que só
 * olhava `data` — traduziu qualquer erro em "essa música não está mais na
 * fila", sem nunca chegar no UPDATE. Aprovar, remover e trocar ficaram mortos.
 */
const HOST = "00000000-0000-0000-0000-000000000001";
const ITEM = "11111111-1111-4111-8111-111111111111";
const ROOM = { host_id: HOST, code: "KARAOKE" };

type Result = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
};

const mocks = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  log: [] as { op: string; select: string; eq: [string, unknown][] }[],
  revalidate: [] as string[],
  /** Quem está logado; o padrão é o host, mas o autor do pedido também entra. */
  user: "00000000-0000-0000-0000-000000000001",
  client: null as unknown,
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    mocks.revalidate.push(String(args[0]));
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => new Map() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.client,
}));

function installSupabase() {
  mocks.log.length = 0;
  mocks.user = HOST;
  mocks.client = {
    auth: { getUser: async () => ({ data: { user: { id: mocks.user } }, error: null }) },
    from(table: string) {
      let mode: "read" | "write" = "read";
      let selected = "";
      const eqs: [string, unknown][] = [];
      const api: Record<string, unknown> = {
        select(cols: string) {
          selected = cols;
          if (mode === "write") {
            return Promise.resolve(
              mocks.results[`${table}.select`] ?? { data: [], error: null }
            );
          }
          return api;
        },
        eq(col: string, value: unknown) {
          eqs.push([col, value]);
          return api;
        },
        maybeSingle() {
          mocks.log.push({ op: "select", select: selected, eq: eqs });
          return Promise.resolve(
            mocks.results[`${table}.maybeSingle`] ?? { data: null, error: null }
          );
        },
        update() {
          mode = "write";
          return api;
        },
        delete() {
          mode = "write";
          return api;
        },
        insert() {
          mode = "write";
          return api;
        },
      };
      return api;
    },
    rpc(name: string) {
      mocks.log.push({ op: "rpc", select: name, eq: [] });
      return Promise.resolve(mocks.results.rpc ?? { data: null, error: null });
    },
  };
}

beforeEach(() => {
  mocks.results = {};
  mocks.revalidate.length = 0;
  installSupabase();
});

describe("setQueueItemStatusAction", () => {
  it("aprova a música lendo a sala pelo nome da FK (não pelo embed ambíguo)", async () => {
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "pending", added_by_user_id: HOST, rooms: ROOM },
      error: null,
    };
    mocks.results["queue_items.select"] = {
      data: [{ id: ITEM, status: "approved" }],
      error: null,
    };

    const result = await setQueueItemStatusAction(ITEM, "approved");

    expect(result).toEqual({ ok: true, item: { id: ITEM, status: "approved" } });
    const read = mocks.log[0];
    expect(read.select).toContain("rooms!queue_items_room_id_fkey(host_id, code)");
    expect(read.select).not.toContain("rooms!inner");
    expect(read.eq).toEqual([["id", ITEM]]);
    expect(mocks.revalidate).toEqual(["/salas/KARAOKE", "/salas/KARAOKE/buscar"]);
  });

  it("erro do PostgREST na leitura vira READ_FAILED — nunca 'não está mais na fila'", async () => {
    mocks.results["queue_items.maybeSingle"] = {
      data: null,
      error: {
        code: "PGRST201",
        message:
          "Could not embed because more than one relationship was found for 'queue_items' and 'rooms'",
      },
    };

    const result = await setQueueItemStatusAction(ITEM, "approved");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("deveria falhar");
    expect(result.code).toBe("READ_FAILED");
    expect(result.error).toMatch(/PGRST201|relationship/);
    // e, principalmente: o UPDATE nem chega a ser tentado.
    expect(mocks.log.map((entry) => entry.op)).toEqual(["select"]);
  });

  it("item que realmente não existe mais devolve NOT_FOUND", async () => {
    mocks.results["queue_items.maybeSingle"] = { data: null, error: null };

    const result = await setQueueItemStatusAction(ITEM, "approved");

    expect(result).toEqual({
      ok: false,
      error: "Essa música não está mais na fila.",
      code: "NOT_FOUND",
    });
  });

  it("update que a RLS barra diz que só o dono aprova (não erro genérico)", async () => {
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "pending", added_by_user_id: HOST, rooms: ROOM },
      error: null,
    };
    mocks.results["queue_items.select"] = { data: [], error: null };

    const result = await setQueueItemStatusAction(ITEM, "approved");

    expect(result).toEqual({
      ok: false,
      error: "Só o dono da sala pode aprovar ou rejeitar músicas.",
      code: "RLS_BLOCKED",
    });
  });
});

describe("removeQueueItemAction", () => {
  it("remove a música encontrada na pré-leitura", async () => {
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "pending", added_by_user_id: HOST, rooms: ROOM },
      error: null,
    };
    mocks.results["queue_items.select"] = { data: [{ id: ITEM }], error: null };

    const result = await removeQueueItemAction(ITEM);

    expect(result).toEqual({ ok: true, itemId: ITEM });
    expect(mocks.log[0].select).toContain("rooms!queue_items_room_id_fkey");
  });

  it("o AUTOR tira o próprio pedido da fila (o botão existia e sempre dava erro)", async () => {
    const author = "99999999-9999-4999-8999-999999999999";
    mocks.user = author;
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "approved", added_by_user_id: author, rooms: ROOM },
      error: null,
    };
    mocks.results["queue_items.select"] = { data: [{ id: ITEM }], error: null };

    const result = await removeQueueItemAction(ITEM);

    expect(result).toEqual({ ok: true, itemId: ITEM });
  });

  it("o AUTOR também tira o pedido que ainda nem chegou ao host", async () => {
    const author = "99999999-9999-4999-8999-999999999999";
    mocks.user = author;
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "pending", added_by_user_id: author, rooms: ROOM },
      error: null,
    };
    mocks.results["queue_items.select"] = { data: [{ id: ITEM }], error: null };

    await expect(removeQueueItemAction(ITEM)).resolves.toEqual({
      ok: true,
      itemId: ITEM,
    });
  });

  it("ninguém tira o pedido de outra pessoa, e a mensagem diz isso", async () => {
    const other = "99999999-9999-4999-8999-999999999999";
    mocks.user = "88888888-8888-4888-8888-888888888888";
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "approved", added_by_user_id: other, rooms: ROOM },
      error: null,
    };

    const result = await removeQueueItemAction(ITEM);

    expect(result).toEqual({
      ok: false,
      error: "Você só pode tirar da fila a música que você mesmo pediu.",
      code: "FORBIDDEN",
    });
  });

  it("o autor não cancela a música que já está tocando (isso é do host)", async () => {
    const author = "99999999-9999-4999-8999-999999999999";
    mocks.user = author;
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "playing", added_by_user_id: author, rooms: ROOM },
      error: null,
    };

    const result = await removeQueueItemAction(ITEM);

    expect(result).toEqual({
      ok: false,
      error: "Esta música está tocando agora — peça para o dono da sala pular.",
      code: "INVALID_TRANSITION",
    });
  });

  it("o host continua tirando qualquer item, inclusive o que está tocando", async () => {
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "playing", added_by_user_id: "outro", rooms: ROOM },
      error: null,
    };
    mocks.results["queue_items.select"] = { data: [{ id: ITEM }], error: null };

    await expect(removeQueueItemAction(ITEM)).resolves.toEqual({
      ok: true,
      itemId: ITEM,
    });
  });
});

describe("replaceQueueSongAction", () => {
  it("troca a música do próprio pedido", async () => {
    mocks.results["queue_items.maybeSingle"] = {
      data: { id: ITEM, status: "pending", added_by_user_id: HOST, rooms: ROOM },
      error: null,
    };
    mocks.results.rpc = { data: true, error: null };

    const result = await replaceQueueSongAction(ITEM, {
      videoId: "abc123",
      title: "Evidências",
    });

    expect(result).toEqual({ ok: true, item: { id: ITEM, title: "Evidências" } });
    expect(mocks.log[0].select).toContain("rooms!queue_items_room_id_fkey");
  });

  it("falha de leitura na troca também sai como READ_FAILED", async () => {
    mocks.results["queue_items.maybeSingle"] = {
      data: null,
      error: { code: "PGRST201", message: "more than one relationship" },
    };

    const result = await replaceQueueSongAction(ITEM, { videoId: "abc123", title: "X" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("deveria falhar");
    expect(result.code).toBe("READ_FAILED");
    expect(mocks.log.map((entry) => entry.op)).toEqual(["select"]);
  });
});
