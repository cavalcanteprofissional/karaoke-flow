import { z } from "zod";

import { checkPresence } from "@/lib/bars/geo";
import type { BarLocation } from "@/lib/bars/geo";
import type { GeoCoordinates } from "@/lib/consent/geo";

export type MembershipStatus = "host" | "approved" | "pending" | "none";

export const queueSongSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .min(1, "Informe o código da sala.")
    .max(20, "Código de sala inválido."),
  video: z.object({
    videoId: z.string().trim().min(1, "Vídeo inválido.").max(40, "Vídeo inválido."),
    title: z
      .string()
      .trim()
      .min(1, "Música sem título.")
      .max(200, "Título muito longo."),
    thumbnailUrl: z.string().url("Thumbnail inválida.").max(500).nullable().optional(),
    durationSeconds: z
      .number()
      .int("Duração inválida.")
      .min(0, "Duração inválida.")
      .max(86400, "Duração inválida.")
      .nullable()
      .optional(),
  }),
});

export type QueueSongInput = z.infer<typeof queueSongSchema>;

export type QueueSongVideo = NonNullable<QueueSongInput["video"]>;

export type QueueBuildContext = {
  input: QueueSongInput;
  roomId: string;
  userId: string;
  membership: MembershipStatus;
  isHost: boolean;
  bar: BarLocation;
  userCoords: GeoCoordinates | null;
};

export type QueueBuildResult =
  | {
      ok: true;
      insert: {
        roomId: string;
        userId: string;
        video: QueueSongVideo;
      };
    }
  | { ok: false; error: string; geoRequired?: boolean; code?: string };

/**
 * Valida e gera o insert da fila com o gate de presença física (regra pura).
 * O status inicial (approved/pending) é computado no banco pelo trigger
 * `queue_items_initial_status` — o client nunca escolhe status.
 */
export function buildQueueSongItem(ctx: QueueBuildContext): QueueBuildResult {
  const parsed = queueSongSchema.safeParse(ctx.input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Música inválida.",
      code: "VALIDATION",
    };
  }

  if (ctx.membership === "none" || ctx.membership === "pending") {
    return {
      ok: false,
      error:
        ctx.membership === "pending"
          ? "Você ainda não foi aprovado nesta sala."
          : "Você não é membro desta sala.",
      code: ctx.membership.toUpperCase(),
    };
  }

  if (!ctx.isHost) {
    const presence = checkPresence({
      isHost: false,
      userCoords: ctx.userCoords,
      barCoords:
        ctx.bar.latitude !== null && ctx.bar.longitude !== null
          ? { latitude: ctx.bar.latitude, longitude: ctx.bar.longitude }
          : null,
      radiusMeters: ctx.bar.raioPermitidoMetros,
    });
    if (!presence.ok) {
      return {
        ok: false,
        error: presence.error,
        geoRequired: true,
        code: presence.reason === "geo-unavailable" ? "GEO_UNAVAILABLE" : "OUTSIDE_BAR",
      };
    }
  }

  return {
    ok: true,
    insert: { roomId: ctx.roomId, userId: ctx.userId, video: parsed.data.video },
  };
}