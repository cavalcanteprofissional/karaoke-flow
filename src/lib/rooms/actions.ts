"use server";

import { revalidatePath } from "next/cache";

import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revokeGoogleToken } from "@/lib/youtube/app-oauth";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/rooms/utils";
import type { MemberStatus, RoomEntryMode, RoomQueueApprovalMode } from "@/types/room";

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  if (/sala não encontrada|inativa/i.test(message))
    return "Sala não encontrada ou inativa.";
  if (/mesa inválida|mesa não existe/i.test(message))
    return "Mesa inválida para esta casa.";
  if (/aguarde a aprovação/i.test(message))
    return "Aguarde a aprovação para escolher a mesa.";
  if (/você não é membro/i.test(message)) return "Você não é membro desta sala.";
  if (/código de sala inválido|sem código de sala disponível/i.test(message))
    return "Código de sala inválido ou esgotado (3–12 letras/números).";
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

export async function reopenRoomAction(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reopen_room", { p_room_id: roomId });
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível reabrir a sala."),
    };
  }
  if (data !== true) {
    return { ok: false, error: "Só o dono pode reabrir a sala." };
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

export async function updateRoomCodeAction(
  roomId: string,
  code: string
): Promise<{ ok: boolean; error?: string; newCode?: string }> {
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) {
    return {
      ok: false,
      error: "Código inválido: use 3–12 letras ou números, sem acentos ou espaços.",
    };
  }

  const supabase = await createClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("code")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return { ok: false, error: "Sala não encontrada." };
  }
  if (room.code === normalized) {
    return { ok: true, newCode: normalized };
  }

  const { data: available, error: availError } = (await supabase.rpc(
    "room_code_available",
    {
      p_code: normalized,
    }
  )) as { data: unknown; error: { message: string } | null };
  if (availError) {
    return {
      ok: false,
      error: friendlyError(availError.message, "Não foi possível validar o código."),
    };
  }
  if (available !== true) {
    return {
      ok: false,
      error: "Este código já pertence a outro karaokê ou bar. Escolha outro.",
    };
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({ code: normalized })
    .eq("id", roomId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível trocar o código."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Só o dono pode trocar o código da sala." };
  }

  revalidatePath("/salas/[codigo]", "page");
  return { ok: true, newCode: normalized };
}

export async function pickMesaAction(
  roomId: string,
  mesa: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = (await supabase.rpc("pick_mesa", {
    p_room_id: roomId,
    p_mesa: mesa,
  })) as { data: unknown; error: { message: string } | null };
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível marcar a mesa."),
    };
  }
  revalidatePath("/salas/[codigo]", "page");
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

  const { error } = await admin
    .from("youtube_oauth_tokens")
    .delete()
    .eq("host_id", user.id);
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível remover a conexão."),
    };
  }

  revalidatePath("/salas/[codigo]", "page");
  return { ok: true };
}
