import { describe, expect, it } from "vitest";

import type { BarLocation } from "@/lib/bars/geo";
import { buildQueueSongItem } from "./queue";

const BAR: BarLocation = { latitude: -23.5613, longitude: -46.6565, raioPermitidoMetros: 150 };
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
    expect(result).toMatchObject({ ok: false, geoRequired: true, code: "GEO_UNAVAILABLE" });
  });

  it("participante fora do raio é bloqueado", () => {
    const result = buildQueueSongItem(context({ userCoords: FAR as never }));
    expect(result).toMatchObject({ ok: false, geoRequired: true, code: "OUTSIDE_BAR" });
  });

  it("host é isento mesmo sem userCoords", () => {
    const result = buildQueueSongItem(context({ isHost: true, userCoords: null, bar: BAR }));
    expect(result.ok).toBe(true);
  });
});