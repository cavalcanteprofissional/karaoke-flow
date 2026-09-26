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
    title: z.string().trim().min(1, "Música sem título.").max(200, "Título muito longo."),
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
/**
 * Status da fila (enum `queue_item_status` do banco). O client não escolhe o
 * status no INSERT — o trigger `queue_items_initial_status` decide — mas precisa
 * do vocabulário para ler, rotular e decidir transições.
 */
export const QUEUE_ITEM_STATUSES = [
  "pending",
  "approved",
  "playing",
  "played",
  "rejected",
  "skipped",
  "cancelled",
] as const;

export type QueueItemStatus = (typeof QUEUE_ITEM_STATUSES)[number];

/** Fila viva: o que o participante vê hoje (o resto sai da lista). */
export const QUEUE_VISIBLE_STATUSES: QueueItemStatus[] = [
  "pending",
  "approved",
  "playing",
];

/** Decisões de aprovação do host nesta fase (Fase 5, Bloco A). */
export const queueModerationStatusSchema = z.enum(["approved", "rejected"]);
export type QueueModerationStatus = z.infer<typeof queueModerationStatusSchema>;

export const queueItemIdSchema = z.string().uuid("Item inválido.");

export type QueueItemSummary = {
  id: string;
  status: string;
  added_by_user_id: string;
};

export type QueueModerationContext = {
  isHost: boolean;
  userId: string;
  item: QueueItemSummary | null;
  decision: unknown;
};

export type QueueModerationResult =
  | { ok: true; itemId: string; status: QueueModerationStatus }
  | { ok: false; error: string; code: string };

/** Transições que o host pode decidir agora — `playing`/terminais ficam p/ Fase 6/7. */
const MODERABLE_FROM: QueueItemStatus[] = ["pending", "approved"];

/**
 * Regra pura da decisão do host sobre uma música da fila (aprovar/rejeitar).
 * Autorização em duas camadas: esta regra (feedback imediato) e a RLS
 * `queue_items_update_host` (autoridade real) — o `.select()` da action detecta
 * o no-op de policy. Reproduz `docs/flows/fluxos-do-sistema.md` §3.2.
 */
export function buildQueueModeration(ctx: QueueModerationContext): QueueModerationResult {
  const decision = queueModerationStatusSchema.safeParse(ctx.decision);
  if (!decision.success) {
    return { ok: false, error: "Decisão inválida.", code: "VALIDATION" };
  }
  if (!ctx.item) {
    return {
      ok: false,
      error: "Essa música não está mais na fila.",
      code: "NOT_FOUND",
    };
  }
  const id = queueItemIdSchema.safeParse(ctx.item.id);
  if (!id.success) {
    return { ok: false, error: "Música inválida.", code: "VALIDATION" };
  }
  if (!ctx.isHost) {
    return {
      ok: false,
      error: "Só o dono da sala pode aprovar ou rejeitar músicas.",
      code: "FORBIDDEN",
    };
  }
  if (!MODERABLE_FROM.includes(ctx.item.status as QueueItemStatus)) {
    return {
      ok: false,
      error:
        ctx.item.status === "playing"
          ? "Esta música está tocando agora — pule para a próxima para tirá-la."
          : "Esta música já saiu da fila.",
      code: "INVALID_TRANSITION",
    };
  }
  return { ok: true, itemId: id.data, status: decision.data };
}

export type QueueRemovalContext = {
  isHost: boolean;
  item: QueueItemSummary | null;
};

export type QueueRemovalResult =
  { ok: true; itemId: string } | { ok: false; error: string; code: string };

/**
 * Regra pura da remoção de uma música da fila pelo host (Bloco A). O DELETE é
 * host-only na RLS (`queue_items_delete_host`) e o item pode ser `pending`,
 * `approved` ou `playing`; terminais já sumiram da fila viva.
 */
export function buildQueueRemoval(ctx: QueueRemovalContext): QueueRemovalResult {
  if (!ctx.item) {
    return { ok: false, error: "Essa música não está mais na fila.", code: "NOT_FOUND" };
  }
  const id = queueItemIdSchema.safeParse(ctx.item.id);
  if (!id.success) {
    return { ok: false, error: "Música inválida.", code: "VALIDATION" };
  }
  if (!ctx.isHost) {
    return {
      ok: false,
      error: "Só o dono da sala pode remover músicas.",
      code: "FORBIDDEN",
    };
  }
  if (!QUEUE_VISIBLE_STATUSES.includes(ctx.item.status as QueueItemStatus)) {
    return {
      ok: false,
      error: "Esta música já saiu da fila.",
      code: "INVALID_TRANSITION",
    };
  }
  return { ok: true, itemId: id.data };
}

export type QueueStatusView = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  /** Item do "tocando agora" — o player vai consumir isto na Fase 6/7. */
  isPlaying: boolean;
};

/** Rótulo e badge de cada estado (Bloco E): pendente ≠ na fila ≠ tocando. */
export function queueStatusView(status: string): QueueStatusView {
  switch (status) {
    case "pending":
      return { label: "aguardando aprovação", variant: "secondary", isPlaying: false };
    case "approved":
      return { label: "na fila", variant: "outline", isPlaying: false };
    case "playing":
      return { label: "tocando agora", variant: "default", isPlaying: true };
    case "played":
      return { label: "tocada", variant: "outline", isPlaying: false };
    case "skipped":
      return { label: "pulada", variant: "outline", isPlaying: false };
    case "rejected":
      return { label: "rejeitada", variant: "destructive", isPlaying: false };
    case "cancelled":
      return { label: "encerrada", variant: "outline", isPlaying: false };
    default:
      return { label: status, variant: "outline", isPlaying: false };
  }
}
