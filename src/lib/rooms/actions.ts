"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { MemberStatus, RoomEntryMode, RoomQueueApprovalMode } from "@/types/room";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  if (/sala não encontrada|inativa/i.test(message))
    return "Sala não encontrada ou inativa.";
  return message;
}

export type CreateRoomResult = { id: string; code: string };

export type JoinRoomResult = { status: MemberStatus };

export async function createRoomAction(): Promise<CreateRoomResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login para criar uma sala.");

  const { data: code, error: codeError } = await supabase.rpc("generate_room_code");
  if (codeError || typeof code !== "string" || code.length !== 6) {
    throw new Error("Não foi possível gerar o código da sala. Tente novamente.");
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({
      code,
      host_id: user.id,
      qr_code_url: `${APP_URL}/entrar?code=${code}`,
    })
    .select("id, code")
    .single();

  if (error) {
    throw new Error(friendlyError(error.message, "Não foi possível criar a sala."));
  }

  revalidatePath("/dashboard");
  return { id: data.id, code: data.code };
}

export type PreviewResult =
  | { preview: import("@/types/room").RoomPreview; error?: never }
  | { preview?: never; error: string };

export async function getRoomPreviewAction(code: string): Promise<PreviewResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_room_preview", { p_code: code });
  if (error || !Array.isArray(data) || data.length === 0) {
    return { error: "Sala não encontrada ou inativa." };
  }
  return { preview: data[0] };
}

export type JoinRoomActionResult =
  { ok: true; membership: { status: MemberStatus } } | { ok: false; error: string };

export async function joinRoomAction(code: string): Promise<JoinRoomActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_room", { p_code: code });
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível entrar na sala."),
    };
  }
  const membership = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard");
  return { ok: true, membership: { status: membership?.status ?? "pending" } };
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
  const { data, error } = await supabase
    .from("rooms")
    .update({ status: "closed" })
    .eq("id", roomId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível encerrar a sala."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Só o dono pode encerrar a sala." };
  }
  revalidatePath("/salas/[codigo]", "page");
  revalidatePath("/dashboard");
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
