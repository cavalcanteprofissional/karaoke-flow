"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { readUserGeoFromCookies } from "@/lib/bars/presence";
import { createClient } from "@/lib/supabase/server";
import type { BarLocation } from "@/lib/bars/geo";
import { buildQueueSongItem } from "./queue";
import type { QueueSongInput } from "./queue";

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
    return { ok: false, error: "Faça login para adicionar músicas.", code: "UNAUTHENTICATED" };
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