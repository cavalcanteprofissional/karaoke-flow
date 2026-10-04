import { describe, expect, it, vi } from "vitest";

import type { BarLocation } from "@/lib/bars/geo";
import {
  buildQueueModeration,
  buildQueueRemoval,
  buildQueueSongItem,
  buildQueueSongReplacement,
  composeQueueOrder,
  moveQueueItem,
  reorderSchema,
  resolveOwnActiveSong,
  QUEUE_ITEM_STATUSES,
  QUEUE_VISIBLE_STATUSES,
  queueStatusView,
} from "./queue";
import { readOwnActiveSong } from "./queue-actions";

const BAR: BarLocation = {
  latitude: -23.5613,
  longitude: -46.6565,
  raioPermitidoMetros: 150,
};
const HERE = { latitude: -23.5613, longitude: -46.6565 };
const FAR = { latitude: -23.55, longitude: -46.633 };

const VIDEO = {
  videoId: "ABC123",
  title: "Uma música",
  thumbnailUrl: "https://img.youtube.com/vi/ABC123/mqdefault.jpg",
  durationSeconds: 240,
};

function context(overrides: Partial<Parameters<typeof buildQueueSongItem>[0]> = {}) {
  return {
    input: { roomCode: "KARAOK", video: VIDEO },
    roomId: "room-1",
    userId: "user-1",
    membership: "approved" as const,
    isHost: false,
    bar: BAR,
    userCoords: HERE as never,
    ...overrides,
  };
}

describe("buildQueueSongItem", () => {
  it("membro aprovado dentro do raio gera o insert", () => {
    const result = buildQueueSongItem(context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.insert).toEqual({
      roomId: "room-1",
      userId: "user-1",
      video: VIDEO,
    });
  });

  it("valida o vídeo (título vazio)", () => {
    const result = buildQueueSongItem(
      context({ input: { roomCode: "KARAOK", video: { ...VIDEO, title: "  " } } })
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("valida a duração negativa", () => {
    const result = buildQueueSongItem(
      context({ input: { roomCode: "KARAOK", video: { ...VIDEO, durationSeconds: -5 } } })
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("aceita campos opcionais de thumbnail/duração ausentes", () => {
    const result = buildQueueSongItem(
      context({
        input: { roomCode: "KARAOK", video: { videoId: "X", title: "Sem duração" } },
      })
    );
    expect(result.ok).toBe(true);
  });

  it("não-membro é barrado sem gate de geo", () => {
    expect(buildQueueSongItem(context({ membership: "none" }))).toMatchObject({
      ok: false,
      code: "NONE",
    });
  });

  it("membro pendente é barrado", () => {
    expect(buildQueueSongItem(context({ membership: "pending" }))).toMatchObject({
      ok: false,
      code: "PENDING",
    });
  });

  it("participante sem geo é bloqueado com geoRequired", () => {
    const result = buildQueueSongItem(context({ userCoords: null }));
    expect(result).toMatchObject({
      ok: false,
      geoRequired: true,
      code: "GEO_UNAVAILABLE",
    });
  });

  it("participante fora do raio é bloqueado", () => {
    const result = buildQueueSongItem(context({ userCoords: FAR as never }));
    expect(result).toMatchObject({ ok: false, geoRequired: true, code: "OUTSIDE_BAR" });
  });

  it("host é isento mesmo sem userCoords", () => {
    const result = buildQueueSongItem(
      context({ isHost: true, userCoords: null, bar: BAR })
    );
    expect(result.ok).toBe(true);
  });
});
describe("buildQueueModeration (aprovar/rejeitar)", () => {
  const HOST = "11111111-1111-4111-8111-111111111111";
  const item = {
    id: "22222222-2222-4222-8222-222222222222",
    status: "pending",
    added_by_user_id: "user-1",
  };
  const ctx = (over: Partial<Parameters<typeof buildQueueModeration>[0]> = {}) => ({
    isHost: true,
    userId: HOST,
    item,
    decision: "approved",
    ...over,
  });

  it("aprova um item pendente", () => {
    const built = buildQueueModeration(ctx());
    expect(built).toEqual({ ok: true, itemId: item.id, status: "approved" });
  });

  it("rejeita um item pendente", () => {
    const built = buildQueueModeration(ctx({ decision: "rejected" }));
    expect(built).toEqual({ ok: true, itemId: item.id, status: "rejected" });
  });

  it("rejeita um item já aprovado (host não quer tocar)", () => {
    const built = buildQueueModeration(
      ctx({ item: { ...item, status: "approved" }, decision: "rejected" })
    );
    expect(built.ok).toBe(true);
  });

  it("recusa decisão fora de approved/rejected", () => {
    for (const decision of ["playing", "played", "removed", "", null, 3]) {
      const built = buildQueueModeration(ctx({ decision }));
      expect(built).toMatchObject({ ok: false, code: "VALIDATION" });
    }
  });

  it("recusa item inexistente", () => {
    const built = buildQueueModeration(ctx({ item: null }));
    expect(built).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("recusa id que não é uuid", () => {
    const built = buildQueueModeration(ctx({ item: { ...item, id: "abc" } }));
    expect(built).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("não deixa quem não é o host decidir", () => {
    const built = buildQueueModeration(ctx({ isHost: false }));
    expect(built).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("não mexe em item tocando nem em status terminal", () => {
    for (const status of ["playing", "played", "skipped", "rejected", "cancelled"]) {
      const built = buildQueueModeration(ctx({ item: { ...item, status } }));
      expect(built).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    }
  });

  it("diz ao host para pular a música que está tocando", () => {
    const built = buildQueueModeration(ctx({ item: { ...item, status: "playing" } }));
    expect(built.ok === false && built.error).toMatch(/tocando agora/);
  });
});

describe("buildQueueRemoval (remover da fila)", () => {
  const item = {
    id: "22222222-2222-4222-8222-222222222222",
    status: "approved",
    added_by_user_id: "user-1",
  };
  const ctx = (over: Partial<Parameters<typeof buildQueueRemoval>[0]> = {}) => ({
    isHost: true,
    userId: "host-1",
    item,
    ...over,
  });

  it("remove item pendente ou aprovado", () => {
    for (const status of ["pending", "approved", "playing"]) {
      expect(buildQueueRemoval(ctx({ item: { ...item, status } }))).toEqual({
        ok: true,
        itemId: item.id,
      });
    }
  });

  it("o autor tira o próprio pedido, pendente ou aprovado", () => {
    // Correção de 2026-09-27: o botão "Tirar da fila" já era renderizado para
    // quem pediu, mas a regra recusava — e o DELETE era host-only na RLS
    // (policy `queue_items_delete_own`, migration 20260927000031).
    for (const status of ["pending", "approved"]) {
      expect(
        buildQueueRemoval(
          ctx({ isHost: false, userId: "user-1", item: { ...item, status } })
        )
      ).toEqual({ ok: true, itemId: item.id });
    }
  });

  it("participante não tira o pedido de outra pessoa", () => {
    const built = buildQueueRemoval(ctx({ isHost: false, userId: "user-2" }));
    expect(built).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(built.ok === false && built.error).toMatch(/você mesmo pediu/);
  });

  it("o autor não cancela o que já está tocando (isso é do host)", () => {
    const built = buildQueueRemoval(
      ctx({ isHost: false, userId: "user-1", item: { ...item, status: "playing" } })
    );
    expect(built).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(built.ok === false && built.error).toMatch(/tocando agora/);
  });

  it("o host tira o que está tocando e o pedido de qualquer pessoa", () => {
    expect(buildQueueRemoval(ctx({ userId: "user-2", item: { ...item, status: "playing" } })))
      .toEqual({ ok: true, itemId: item.id });
  });

  it("recusa item que já saiu da fila", () => {
    for (const status of ["played", "skipped", "rejected", "cancelled"]) {
      expect(buildQueueRemoval(ctx({ item: { ...item, status } }))).toMatchObject({
        ok: false,
        code: "INVALID_TRANSITION",
      });
    }
  });

  it("recusa item inexistente ou id inválido", () => {
    expect(buildQueueRemoval(ctx({ item: null }))).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(buildQueueRemoval(ctx({ item: { ...item, id: "xyz" } }))).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
  });
});

describe("queueStatusView (rótulo por estado)", () => {
  it("distingue pendente, na fila e tocando", () => {
    expect(queueStatusView("pending")).toMatchObject({ label: "aguardando aprovação" });
    expect(queueStatusView("approved")).toMatchObject({ label: "na fila" });
    expect(queueStatusView("playing")).toMatchObject({
      label: "tocando agora",
      isPlaying: true,
    });
  });

  it("cobre os terminais sem quebrar", () => {
    expect(queueStatusView("played").label).toBe("tocada");
    expect(queueStatusView("skipped").label).toBe("pulada");
    expect(queueStatusView("rejected").label).toBe("rejeitada");
    expect(queueStatusView("cancelled").label).toBe("encerrada");
    expect(queueStatusView("desconhecido").label).toBe("desconhecido");
  });
});

describe("constantes da fila", () => {
  it("expõe os 7 status do enum do banco", () => {
    expect(QUEUE_ITEM_STATUSES).toHaveLength(7);
  });

  it("mantém a fila viva em pending/approved/playing", () => {
    expect(QUEUE_VISIBLE_STATUSES).toEqual(["pending", "approved", "playing"]);
  });
});

describe("composeQueueOrder (Bloco C)", () => {
  it("mantém tocando na frente, aprovadas na ordem escolhida e pendentes no fim", () => {
    expect(
      composeQueueOrder({
        playing: ["tocando"],
        approved: ["aprovada-1", "aprovada-2"],
        pending: ["pendente-1"],
      })
    ).toEqual(["tocando", "aprovada-1", "aprovada-2", "pendente-1"]);
  });

  it("aceita a fila só com-playing e só com-pendente", () => {
    expect(composeQueueOrder({ playing: ["a"], approved: [], pending: ["b"] })).toEqual([
      "a",
      "b",
    ]);
    expect(composeQueueOrder({ playing: [], approved: [], pending: ["b"] })).toEqual([
      "b",
    ]);
  });
});

describe("moveQueueItem (Bloco C)", () => {
  const order = ["a", "b", "c"];

  it("sobe e desce uma casa", () => {
    expect(moveQueueItem(order, "c", "up")).toEqual(["a", "c", "b"]);
    expect(moveQueueItem(order, "a", "down")).toEqual(["b", "a", "c"]);
  });

  it("não mexe nas bordas", () => {
    expect(moveQueueItem(order, "a", "up")).toEqual(["a", "b", "c"]);
    expect(moveQueueItem(order, "c", "down")).toEqual(["a", "b", "c"]);
  });

  it("id fora da ordem devolve a ordem intacta", () => {
    expect(moveQueueItem(order, "z", "up")).toEqual(["a", "b", "c"]);
  });

  it("não muta a lista original", () => {
    const original = [...order];
    moveQueueItem(order, "a", "down");
    expect(order).toEqual(original);
  });
});

describe("reorderSchema (Bloco C)", () => {
  const id = "3f0a1b2c-4d5e-4f60-8a1b-2c3d4e5f6a7b";

  it("aceita a fila completa em qualquer ordem", () => {
    expect(reorderSchema.safeParse([id, id.replace("3f0a", "9a1b")]).success).toBe(true);
  });

  it("recusa fila vazia, duplicados e ids inválidos", () => {
    expect(reorderSchema.safeParse([]).success).toBe(false);
    expect(reorderSchema.safeParse([id, id]).success).toBe(false);
    expect(reorderSchema.safeParse(["nao-e-uuid"]).success).toBe(false);
  });
});

describe("buildQueueSongReplacement (Bloco D)", () => {
  const ITEM = {
    id: "3f0a1b2c-4d5e-4f60-8a1b-2c3d4e5f6a7b",
    status: "approved",
    added_by_user_id: "user-1",
  };

  function context(over: Record<string, unknown> = {}) {
    return {
      isHost: false,
      currentUserId: "user-1",
      item: ITEM,
      input: { video: VIDEO },
      ...over,
    } as Parameters<typeof buildQueueSongReplacement>[0];
  }

  it("o autor troca a própria música aprovada, com posição e status preservados", () => {
    const result = buildQueueSongReplacement(context());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.itemId).toBe(ITEM.id);
      expect(result.video.videoId).toBe(VIDEO.videoId);
    }
  });

  it("o host troca a música de qualquer participante (D1)", () => {
    const result = buildQueueSongReplacement(
      context({
        isHost: true,
        currentUserId: "host-1",
        item: { ...ITEM, added_by_user_id: "outro" },
      })
    );
    expect(result.ok).toBe(true);
  });

  it("recusa quando não é autor nem host", () => {
    const result = buildQueueSongReplacement(
      context({ currentUserId: "user-9", item: { ...ITEM, added_by_user_id: "outro" } })
    );
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("aceita item pendente, mas recusa o que já saiu da fila (D3)", () => {
    expect(
      buildQueueSongReplacement(context({ item: { ...ITEM, status: "pending" } })).ok
    ).toBe(true);
    for (const status of ["playing", "played", "rejected", "cancelled", "skipped"]) {
      expect(buildQueueSongReplacement(context({ item: { ...ITEM, status } })).ok).toBe(
        false
      );
    }
  });

  it("trata item ausente e música inválida", () => {
    expect(buildQueueSongReplacement(context({ item: null }))).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      buildQueueSongReplacement(context({ input: { video: { ...VIDEO, title: "  " } } }))
    ).toMatchObject({
      code: "VALIDATION",
    });
  });
});

/**
 * `readOwnActiveSong` — o leitor que alimenta o aviso da tela de busca. Aqui o
 * contrato é outro do da regra pura: o que interessa é **o título que o usuário
 * vai ler**. Uma falha de leitura precisa devolver `undefined` (ninguém fica
 * travado por causa de rede) e nunca um título inventado.
 */
describe("readOwnActiveSong (aviso da tela de busca)", () => {
  const song = (id: string, status: string, position = 1) => ({ id, title: id, status, position });
  function fakeSupabase(result: { data: unknown } | { error: unknown }) {
    const spy = vi.fn().mockReturnValue(result);
    return {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ in: () => Promise.resolve(result) }) }),
        }),
      }),
      spy,
    };
  }

  it("traz o título da que está tocando", async () => {
    const supabase = fakeSupabase({ data: [song("Tocando agora", "playing")] });
    await expect(
      readOwnActiveSong({
        supabase: supabase as never,
        roomId: "sala",
        userId: "visitante",
        isHost: false,
      })
    ).resolves.toEqual({ playing: true, title: "Tocando agora" });
  });

  it("com uma pendente, avisa que o próximo pedido substitui — sem travar", async () => {
    const supabase = fakeSupabase({ data: [song("Já pedi essa", "pending")] });
    await expect(
      readOwnActiveSong({
        supabase: supabase as never,
        roomId: "sala",
        userId: "visitante",
        isHost: false,
      })
    ).resolves.toEqual({ playing: false, title: "Já pedi essa" });
  });

  it("sem nada na fila, não há aviso nenhum", async () => {
    const supabase = fakeSupabase({ data: [] });
    await expect(
      readOwnActiveSong({
        supabase: supabase as never,
        roomId: "sala",
        userId: "visitante",
        isHost: false,
      })
    ).resolves.toEqual({ playing: false, title: null });
  });

  it("o host nunca é avisado (não tem limite na própria sala)", async () => {
    const supabase = fakeSupabase({ data: [song("minha", "playing")] });
    await expect(
      readOwnActiveSong({
        supabase: supabase as never,
        roomId: "sala",
        userId: "host",
        isHost: true,
      })
    ).resolves.toEqual({ playing: false, title: null });
    expect(supabase.spy).not.toHaveBeenCalled();
  });

  it("leitura quebrada não trava ninguém: a trigger segue sendo o portão", async () => {
    const supabase = fakeSupabase({ error: { message: "timeout" } });
    await expect(
      readOwnActiveSong({
        supabase: supabase as never,
        roomId: "sala",
        userId: "visitante",
        isHost: false,
      })
    ).resolves.toBeUndefined();
  });
});

/**
 * `resolveOwnActiveSong` — a regra de "uma música ativa por participante"
 * (migration `20261004000042`). Aqui o que importa é a **fronteira**: o que
 * ocupa vaga e o que não ocupa. Sem o teste de `played`, um dia alguém "simplifica"
 * a regra para "qualquer item meu na fila" e o participante fica trancado para
 * sempre depois da primeira música.
 */
describe("resolveOwnActiveSong (uma música ativa por participante)", () => {
  const song = (id: string, status: string, position = 1) => ({ id, title: id, status, position });
  const ctx = (over: Partial<Parameters<typeof resolveOwnActiveSong>[0]> = {}) => ({
    isHost: false,
    ownSongs: [] as { id: string; title: string; status: string; position: number }[],
    ...over,
  });

  it("sem nada na fila, nada é substituído", () => {
    expect(resolveOwnActiveSong(ctx())).toEqual({ ok: true, replaced: null });
  });

  it("devolve a mais antiga entre as ativas, para o aviso dizer qual saiu", () => {
    const result = resolveOwnActiveSong(
      ctx({ ownSongs: [song("b", "pending", 5), song("a", "approved", 2)] })
    );
    expect(result).toEqual({ ok: true, replaced: { id: "a", title: "a" } });
  });

  it("uma tocando recusa, e recusa vence a troca (a TV não é cortada)", () => {
    const result = resolveOwnActiveSong(
      ctx({ ownSongs: [song("velha", "pending", 1), song("tocando", "playing", 2)] })
    );
    expect(result).toMatchObject({ ok: false, code: "SONG_PLAYING" });
    if (!result.ok) expect(result.error).toContain("já tem uma música tocando");
  });

  it("quem já ouviu não ocupa vaga: terminal é exatamente o inverso de ativo", () => {
    const terminais = ["played", "rejected", "skipped", "cancelled"];
    expect(
      terminais.every((status) => !QUEUE_VISIBLE_STATUSES.includes(status as never))
    ).toBe(true);
    expect(
terminais.every(
        (status) => resolveOwnActiveSong(ctx({ ownSongs: [song("antiga", status)] })).ok
      )
    ).toBe(true);
  });

  it("cada status visível ocupa vaga, inclusive o approved esperando o host", () => {
    for (const status of QUEUE_VISIBLE_STATUSES) {
      if (status === "playing") continue;
      expect(resolveOwnActiveSong(ctx({ ownSongs: [song("minha", status)] }))).toEqual({
        ok: true,
        replaced: { id: "minha", title: "minha" },
      });
    }
  });

  it("o host não tem limite — nem para tocar, nem para acumular", () => {
    const lotacao = [
      song("1", "pending"),
      song("2", "approved"),
      song("3", "playing"),
      song("4", "playing"),
    ];
    expect(resolveOwnActiveSong(ctx({ isHost: true, ownSongs: lotacao }))).toEqual({
      ok: true,
      replaced: null,
    });
  });
});
