import { describe, expect, it } from "vitest";

import type { BarLocation } from "@/lib/bars/geo";
import {
  buildQueueModeration,
  buildQueueRemoval,
  buildQueueSongItem,
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
