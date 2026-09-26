"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { readUserGeoFromCookies } from "@/lib/bars/presence";
import { createClient } from "@/lib/supabase/server";
import type { BarLocation } from "@/lib/bars/geo";
import {
  buildQueueModeration,
  buildQueueRemoval,
  buildQueueSongItem,
  buildQueueSongReplacement,
  reorderSchema,
} from "./queue";
import type { QueueSongInput, QueueSongVideo } from "./queue";

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  return message;
}

export async function addSongToQueueAction(
  input: QueueSongInput
): Promise<
  | { ok: true; item: { status: string; position: number } }
  | { ok: false; error: string; geoRequired?: boolean; code?: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para adicionar músicas.",
      code: "UNAUTHENTICATED",
    };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("id, host_id, bar_id")
    .eq("code", input.roomCode)
    .maybeSingle();
  if (!room) {
    return { ok: false, error: "Sala não encontrada.", code: "ROOM_NOT_FOUND" };
  }

  let bar: BarLocation = { latitude: null, longitude: null, raioPermitidoMetros: null };
  if (room.bar_id) {
    const { data: barRow } = await supabase
      .from("bars")
      .select("latitude, longitude, raio_permitido_metros")
      .eq("id", room.bar_id)
      .maybeSingle();
    if (barRow) {
      bar = {
        latitude: barRow.latitude ?? null,
        longitude: barRow.longitude ?? null,
        raioPermitidoMetros: barRow.raio_permitido_metros ?? null,
      };
    }
  }

  const isHost = room.host_id === user.id;
  let membership = "none" as "host" | "approved" | "pending" | "none";
  if (isHost) {
    membership = "host";
  } else {
    const { data: member } = await supabase
      .from("room_members")
      .select("status")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();
    membership = (member?.status as typeof membership) ?? "none";
  }

  const cookieStore = await cookies();
  const userCoords = readUserGeoFromCookies(cookieStore);

  const built = buildQueueSongItem({
    input,
    roomId: room.id,
    userId: user.id,
    membership,
    isHost,
    bar,
    userCoords,
  });
  if (!built.ok) return built;

  const { data, error } = await supabase
    .from("queue_items")
    .insert({
      room_id: built.insert.roomId,
      added_by_user_id: built.insert.userId,
      youtube_video_id: built.insert.video.videoId,
      title: built.insert.video.title,
      thumbnail_url: built.insert.video.thumbnailUrl ?? null,
      duration_seconds: built.insert.video.durationSeconds ?? null,
    })
    .select("id, status, position");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Você não pode adicionar músicas nesta sala."),
      code: "INSERT_FAILED",
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Você não pode adicionar músicas nesta sala.",
      code: "RLS_BLOCKED",
    };
  }

  revalidatePath(`/salas/${input.roomCode}`);
  revalidatePath(`/salas/${input.roomCode}/buscar`);
  return { ok: true, item: { status: data[0].status, position: data[0].position } };
}
/**
 * Aprova ou rejeita uma música da fila (Fase 5, Bloco A).
 *
 * A escrita vai pelo client do usuário (RLS `queue_items_update_host`,
 * host-only) — sem RPC: a RPC só é necessária quando alguém que **não** é o
 * host precisa escrever (`replace_queue_song`, Bloco D). A regra pura
 * (`buildQueueModeration`) dá o feedback imediato; o `.select()` abaixo é a
 * prova de que a policy deixou passar (no-op de policy vira erro, não sucesso
 * silencioso). Sala encerrada não precisa de checagem própria: `close_room`
 * deixa os itens em `cancelled`, que a regra trata como transição inválida.
 */
export async function setQueueItemStatusAction(
  itemId: string,
  decision: unknown
): Promise<
  | { ok: true; item: { id: string; status: string } }
  | { ok: false; error: string; code: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para gerenciar a fila.",
      code: "UNAUTHENTICATED",
    };
  }

  const { data: item } = await supabase
    .from("queue_items")
    .select("id, status, added_by_user_id, rooms!inner(host_id, code)")
    .eq("id", itemId)
    .maybeSingle();

  const room = (item?.rooms ?? null) as { host_id: string; code: string } | null;
  if (!item || !room) {
    return { ok: false, error: "Essa música não está mais na fila.", code: "NOT_FOUND" };
  }
  const isHost = room.host_id === user.id;

  const built = buildQueueModeration({
    isHost,
    userId: user.id,
    item: item
      ? { id: item.id, status: item.status, added_by_user_id: item.added_by_user_id }
      : null,
    decision,
  });
  if (!built.ok) return built;

  const { data, error } = await supabase
    .from("queue_items")
    .update({ status: built.status })
    .eq("id", built.itemId)
    .select("id, status");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível atualizar a música."),
      code: "UPDATE_FAILED",
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Só o dono da sala pode aprovar ou rejeitar músicas.",
      code: "RLS_BLOCKED",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  revalidatePath(`/salas/${room.code}/buscar`);
  return { ok: true, item: { id: data[0].id, status: data[0].status } };
}

/**
 * Remove uma música da fila (Fase 5, Bloco A). DELETE é host-only na RLS
 * (`queue_items_delete_host`) e o `.select()` prova que a linha saiu — o mesmo
 * anti-no-op do update.
 */
export async function removeQueueItemAction(
  itemId: string
): Promise<{ ok: true; itemId: string } | { ok: false; error: string; code: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para gerenciar a fila.",
      code: "UNAUTHENTICATED",
    };
  }

  const { data: item } = await supabase
    .from("queue_items")
    .select("id, status, added_by_user_id, rooms!inner(host_id, code)")
    .eq("id", itemId)
    .maybeSingle();

  const room = (item?.rooms ?? null) as { host_id: string; code: string } | null;
  if (!item || !room) {
    return { ok: false, error: "Essa música não está mais na fila.", code: "NOT_FOUND" };
  }
  const isHost = room.host_id === user.id;

  const built = buildQueueRemoval({
    isHost,
    item: item
      ? { id: item.id, status: item.status, added_by_user_id: item.added_by_user_id }
      : null,
  });
  if (!built.ok) return built;

  const { data, error } = await supabase
    .from("queue_items")
    .delete()
    .eq("id", built.itemId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível remover a música."),
      code: "DELETE_FAILED",
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Só o dono da sala pode remover músicas.",
      code: "RLS_BLOCKED",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  revalidatePath(`/salas/${room.code}/buscar`);
  return { ok: true, itemId: data[0].id };
}

/**
 * Reordena a fila do host (Fase 5, Bloco C) em UMA chamada atômica: a RPC
 * `reorder_queue` reescreve `position` de 1..N na ordem recebida, sob advisory
 * lock (mesma chave de `next_queue_position`) e exigindo a fila visível inteira.
 * Sem isso, o client teria que fazer N updates — cada um disparando
 * `touch_updated_at` → N refetches do realtime — e abriria janela para
 * posições repetidas (não há unique em `(room_id, position)`).
 */
export async function reorderQueueAction(
  roomId: string,
  itemIds: string[]
): Promise<{ ok: true; itemIds: string[] } | { ok: false; error: string; code: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para reorder a fila.",
      code: "UNAUTHENTICATED",
    };
  }

  const parsed = reorderSchema.safeParse(itemIds);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ordem inválida.",
      code: "VALIDATION",
    };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("code")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return { ok: false, error: "Sala não encontrada.", code: "ROOM_NOT_FOUND" };
  }

  const { data, error } = await supabase.rpc("reorder_queue", {
    p_room_id: roomId,
    p_item_ids: parsed.data,
  });
  if (error) {
    const message = error.message;
    if (/fila desatualizada/i.test(message)) {
      return {
        ok: false,
        error: "A fila mudou enquanto você reordenava — tentando de novo.",
        code: "STALE_QUEUE",
      };
    }
    return {
      ok: false,
      error: friendlyError(message, "Não foi possível reordenar a fila."),
      code: "REORDER_FAILED",
    };
  }
  if (data !== true) {
    return {
      ok: false,
      error: "Só o dono da sala pode reorder a fila.",
      code: "FORBIDDEN",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  return { ok: true, itemIds: parsed.data };
}

/**
 * Trocar a música do item mantendo posição e aprovação (Fase 5, Bloco D,
 * regras D1–D3). Escrita via RPC `replace_queue_song` porque o AUTOR do item
 * não é host e a policy de UPDATE é host-only — o client não ganha UPDATE em
 * `queue_items`.
 */
export async function replaceQueueSongAction(
  itemId: string,
  video: QueueSongVideo
): Promise<
  | { ok: true; item: { id: string; title: string } }
  | { ok: false; error: string; code: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para trocar a música.",
      code: "UNAUTHENTICATED",
    };
  }

  const { data: item } = await supabase
    .from("queue_items")
    .select("id, status, added_by_user_id, rooms!inner(host_id, code)")
    .eq("id", itemId)
    .maybeSingle();
  if (!item?.rooms) {
    return { ok: false, error: "Essa música não está mais na fila.", code: "NOT_FOUND" };
  }
  const room = (Array.isArray(item.rooms) ? item.rooms[0] : item.rooms) as {
    host_id: string;
    code: string;
  };

  const built = buildQueueSongReplacement({
    isHost: room.host_id === user.id,
    currentUserId: user.id,
    item: { id: item.id, status: item.status, added_by_user_id: item.added_by_user_id },
    input: { video },
  });
  if (!built.ok) return built;

  const { data, error } = await supabase.rpc("replace_queue_song", {
    p_item_id: built.itemId,
    p_youtube_video_id: built.video.videoId,
    p_title: built.video.title,
    p_thumbnail_url: built.video.thumbnailUrl ?? null,
    p_duration_seconds: built.video.durationSeconds ?? null,
  });
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível trocar a música."),
      code: "REPLACE_FAILED",
    };
  }
  if (data !== true) {
    return {
      ok: false,
      error: "Você só pode trocar a música que você mesmo pediu.",
      code: "FORBIDDEN",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  revalidatePath(`/salas/${room.code}/buscar`);
  return { ok: true, item: { id: built.itemId, title: built.video.title } };
}
