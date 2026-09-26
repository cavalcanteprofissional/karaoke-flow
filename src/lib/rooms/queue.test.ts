import { describe, expect, it } from "vitest";

import type { BarLocation } from "@/lib/bars/geo";
import {
  buildQueueModeration,
  buildQueueRemoval,
  buildQueueSongItem,
  buildQueueSongReplacement,
  composeQueueOrder,
  moveQueueItem,
  reorderSchema,
  QUEUE_ITEM_STATUSES,
  QUEUE_VISIBLE_STATUSES,
  queueStatusView,
} from "./queue";

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

  it("não deixa participante remover (nem o próprio pedido)", () => {
    const built = buildQueueRemoval(ctx({ isHost: false }));
    expect(built).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(built.ok === false && built.error).toMatch(/dono da sala/);
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
