import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addSongToQueueAction,
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
const ROOM_ID = "22222222-2222-4222-8222-222222222222";

type Result = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
};

const mocks = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  log: [] as { op: string; select: string; eq: [string, unknown][] }[],
  /** Filtros `.in()` das leituras em lista (itens ativos do próprio usuário). */
  ins: [] as [string, unknown][],
  revalidate: [] as string[],
  /** Cookies do request (`kf-geo`): o gate de presença lê daqui. */
  cookies: new Map<string, { value: string }>(),
  /** Quem está logado; o padrão é o host, mas o autor do pedido também entra. */
  user: "00000000-0000-0000-0000-000000000001",
  client: null as unknown,
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    mocks.revalidate.push(String(args[0]));
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.client,
}));

function installSupabase() {
  mocks.log.length = 0;
  mocks.ins.length = 0;
  mocks.user = HOST;
  mocks.client = {
    auth: { getUser: async () => ({ data: { user: { id: mocks.user } }, error: null }) },
    from(table: string) {
      let mode: "read" | "write" = "read";
      let selected = "";
      const eqs: [string, unknown][] = [];
      const ins: [string, unknown][] = [];
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
        /** Leitura em lista (a dos itens ativos do próprio usuário). */
        in(col: string, value: unknown) {
          ins.push([col, value]);
          return api;
        },
        /** Awaits em modo leitura resolvem a lista — é como o PostgREST se comporta. */
        then(
          onFulfilled: (value: Result) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          mocks.log.push({ op: "list", select: selected, eq: eqs });
          mocks.ins.push(...ins);
          return Promise.resolve(
            mocks.results[`${table}.list`] ?? { data: [], error: null }
          ).then(onFulfilled, onRejected);
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
        insert(cols: Record<string, unknown> = {}) {
          mode = "write";
          mocks.log.push({ op: "insert", select: selected, eq: Object.entries(cols) });
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
  mocks.cookies.clear();
  installSupabase();
});

/**
 * `addSongToQueueAction` — a porta de entrada da fila.
 *
 * O teste que faltava: a tela esconde o "Pedir música" para quem entrou fora do
 * raio, mas esconder botão não é regra. Aqui a recusa acontece no servidor — e
 * o `insert` nem é tentado.
 */
describe("addSongToQueueAction", () => {
  const GUEST = "00000000-0000-0000-0000-000000000002";
  const OWN_ITEM = "44444444-4444-4444-8444-444444444444";
  const INSERTED = [{ id: "item-novo", status: "pending", position: 1 }];
  /**
   * A MESMA frase da action (`queue-actions.ts`) e da regra pura (`queue.ts`) — se
   * uma mudar, o usuário passa a ver duas recusas diferentes para o mesmo caso.
   */
  const OWN_SONG_PLAYING_ERROR =
    "Você já tem uma música tocando nesta sala. Dá para pedir outra quando ela terminar.";
  const SONG = {
    roomCode: ROOM.code,
    video: {
      videoId: "dQw4w9WgXcQ",
      title: "Evidências",
      thumbnailUrl: null,
      durationSeconds: 240,
    },
  };

  /** Sala sem GPS exigido (sem bar) ou com coordenadas de referência. */
  function installRoom(bar: unknown | null) {
    mocks.results["rooms.maybeSingle"] = {
      data: { id: ROOM_ID, host_id: HOST, bar_id: bar === null ? null : "bar-1" },
      error: null,
    };
    mocks.results["bars.maybeSingle"] = bar === null
      ? { data: null, error: null }
      : { data: bar, error: null };
    mocks.results["queue_items.select"] = { data: INSERTED, error: null };
  }

  function entryState(state: Record<string, unknown> | null) {
    mocks.results.rpc = { data: state, error: null };
  }

  function dentroDoRaio() {
    mocks.cookies.set("kf-geo", {
      value: JSON.stringify({ status: "granted", coords: { latitude: 0, longitude: 0 } }),
    });
  }

  it("aprovado dentro do raio entra na fila", async () => {
    mocks.user = GUEST;
    installRoom({ latitude: 0, longitude: 0, raio_permitido_metros: 500 });
    dentroDoRaio();
    entryState({ status: "approved", fora_do_raio: false });

    const result = await addSongToQueueAction(SONG);

    expect(result).toEqual({
      ok: true,
      item: { status: "pending", position: 1 },
      replaced: null,
    });
    // O estado efetivo vem de member_entry_state, não de room_members cru.
    expect(mocks.log.map((entry) => entry.select)).toContain("member_entry_state");
  });

  it("espectador fora do raio é recusado com OUTSIDE_BAR e não tenta inserir", async () => {
    mocks.user = GUEST;
    installRoom({ latitude: 0, longitude: 0, raio_permitido_metros: 500 });
    entryState({ status: "approved", fora_do_raio: true, distancia_m: 1200 });

    const result = await addSongToQueueAction(SONG);

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("fora do raio"),
      code: "OUTSIDE_BAR",
    });
    expect(mocks.log.map((entry) => entry.select)).not.toContain("queue_items");
    expect(mocks.revalidate).toEqual([]);
  });

  it("quem nunca entrou recebe a mensagem de membro, não a de espectador", async () => {
    mocks.user = GUEST;
    installRoom({ latitude: 0, longitude: 0, raio_permitido_metros: 500 });
    entryState(null);

    const result = await addSongToQueueAction(SONG);

    expect(result).toEqual({
      ok: false,
      error: expect.any(String),
      code: "NONE",
    });
    expect(mocks.log.map((entry) => entry.select)).not.toContain("queue_items");
  });

  it("o host não depende de member_entry_state", async () => {
    installRoom(null);

    const result = await addSongToQueueAction(SONG);

    expect(result).toEqual({
      ok: true,
      item: { status: "pending", position: 1 },
      replaced: null,
    });
    expect(mocks.log.map((entry) => entry.select)).not.toContain("member_entry_state");
  });

  /**
   * A regra de "uma música ativa por participante" (migration `20261004000042`).
   * A autoridade é a trigger; estas são as portas da aplicação — e a última traz o
   * caso que só o banco consegue responder: a música começou a tocar entre a
   * leitura e o INSERT, e aí quem recusa é a trigger com `KF001`.
   */
  describe("uma música ativa por participante", () => {
    const ativas = (status: string, id: string, position: number) => ({
      id,
      title: `Música ${id.slice(0, 4)}`,
      status,
      position,
    });

    it("participante com uma pending recebe o pedido e ela é anunciada como substituída", async () => {
      mocks.user = GUEST;
      installRoom({ latitude: 0, longitude: 0, raio_permitido_metros: 500 });
      dentroDoRaio();
      entryState({ status: "approved", fora_do_raio: false });
      mocks.results["queue_items.list"] = {
        data: [ativas("pending", OWN_ITEM, 3)],
        error: null,
      };

      const result = await addSongToQueueAction(SONG);

      expect(result).toEqual({
        ok: true,
        item: { status: "pending", position: 1 },
        replaced: { id: OWN_ITEM, title: "Música 4444" },
      });
      // A leitura é dos PRÓPRIOS itens e só dos ativos: os `played` não ocupam vaga.
      const leitura = mocks.log.find((entry) => entry.op === "list");
      expect(leitura?.eq).toEqual(
        expect.arrayContaining([
          ["room_id", ROOM_ID],
          ["added_by_user_id", GUEST],
        ])
      );
      expect(mocks.ins).toContainEqual(["status", ["pending", "approved", "playing"]]);
    });

    it("participante com uma tocando é recusado sem tentar inserir", async () => {
      mocks.user = GUEST;
      installRoom({ latitude: 0, longitude: 0, raio_permitido_metros: 500 });
      dentroDoRaio();
      entryState({ status: "approved", fora_do_raio: false });
      mocks.results["queue_items.list"] = {
        data: [ativas("playing", OWN_ITEM, 1)],
        error: null,
      };

      const result = await addSongToQueueAction(SONG);

      expect(result).toEqual({
        ok: false,
        error: OWN_SONG_PLAYING_ERROR,
        code: "SONG_PLAYING",
      });
      // Nenhum INSERT saiu: recusar antes de escrever é o que impede o item duplicado.
      expect(mocks.log.some((entry) => entry.op === "list")).toBe(true);
      expect(mocks.log.some((entry) => entry.op === "insert")).toBe(false);
      expect(mocks.revalidate).toEqual([]);
    });

    it("KF001 da trigger vira a mesma recusa — a corrida entre ler e inserir", async () => {
      mocks.user = GUEST;
      installRoom({ latitude: 0, longitude: 0, raio_permitido_metros: 500 });
      dentroDoRaio();
      entryState({ status: "approved", fora_do_raio: false });
      mocks.results["queue_items.list"] = { data: [], error: null };
      mocks.results["queue_items.select"] = {
        data: null,
        error: {
          code: "KF001",
          message: OWN_SONG_PLAYING_ERROR,
        },
      };

      const result = await addSongToQueueAction(SONG);

      expect(result).toEqual({
        ok: false,
        error: OWN_SONG_PLAYING_ERROR,
        code: "SONG_PLAYING",
      });
    });

    it("o host não gasta leitura: nenhuma música dele é substituída", async () => {
      installRoom(null);

      const result = await addSongToQueueAction(SONG);

      expect(result).toEqual({
        ok: true,
        item: { status: "pending", position: 1 },
        replaced: null,
      });
      expect(mocks.log.some((entry) => entry.op === "list")).toBe(false);
    });
  });
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
