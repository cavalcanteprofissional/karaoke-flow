"use server";

import { revalidatePath } from "next/cache";

import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revokeGoogleToken } from "@/lib/youtube/app-oauth";
import type { MemberStatus, RoomEntryMode, RoomQueueApprovalMode } from "@/types/room";

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  if (/sala não encontrada|inativa/i.test(message))
    return "Sala não encontrada ou inativa.";
  return message;
}

export type RoomSettingsInput = {
  entry_mode: RoomEntryMode;
  queue_approval_mode: RoomQueueApprovalMode;
  require_song_confirmation: boolean;
};

export async function updateRoomSettingsAction(
  roomId: string,
  settings: RoomSettingsInput
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rooms")
    .update(settings)
    .eq("id", roomId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível salvar as configurações."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Só o dono pode alterar as configurações da sala." };
  }

  revalidatePath("/salas/[codigo]", "page");
  return { ok: true };
}

export async function decideEntryAction(
  roomId: string,
  userId: string,
  status: Extract<MemberStatus, "approved" | "rejected">
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_members")
    .update({ status })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível atualizar o pedido."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Você não pode aprovar entradas nesta sala." };
  }
  revalidatePath("/salas/[codigo]", "page");
  return { ok: true };
}

export async function closeRoomAction(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_room", { p_room_id: roomId });
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível encerrar a sala."),
    };
  }
  if (data !== true) {
    return { ok: false, error: "Só o dono pode encerrar a sala." };
  }
  revalidatePath("/salas/[codigo]", "page");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateYoutubeKeyAction(
  roomId: string,
  apiKey: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const trimmed = apiKey?.trim() || null;

  const { data, error } = await supabase
    .from("rooms")
    .update({ youtube_api_key: trimmed })
    .eq("id", roomId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível salvar a chave do YouTube."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Só o dono pode configurar a chave do YouTube da sala." };
  }

  revalidatePath("/salas/[codigo]", "page");
  return { ok: true };
}

export async function leaveRoomAction(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .select("user_id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível sair da sala."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Você não é membro desta sala." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function youtubeDisconnectAction(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Faça login para administrar a sala." };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("host_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.host_id !== user.id) {
    return { ok: false, error: "Só o dono pode desconectar a conta do YouTube." };
  }

  const admin = createAdmin();
  const { data: stored } = await admin
    .from("youtube_oauth_tokens")
    .select("refresh_token")
    .eq("host_id", user.id)
    .maybeSingle();

  if (stored?.refresh_token) {
    await revokeGoogleToken(stored.refresh_token);
  }

  const { error } = await admin.from("youtube_oauth_tokens").delete().eq("host_id", user.id);
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível remover a conexão."),
    };
  }

  revalidatePath("/salas/[codigo]", "page");
  return { ok: true };
}
