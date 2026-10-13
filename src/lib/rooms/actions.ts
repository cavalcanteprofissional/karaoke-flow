"use server";

import { revalidatePath } from "next/cache";

import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revokeGoogleToken } from "@/lib/youtube/app-oauth";
import { invalidateCachedHostToken } from "@/lib/youtube/host-oauth";
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
  if (/código de bar inválido|sem código de bar disponível/i.test(message))
    return "Código inválido: use 3–12 letras ou números, sem acentos ou espaços.";
  if (/já pertence a outro bar|já pertence a outro karaokê/i.test(message))
    return "Este código já pertence a outro karaokê ou bar. Escolha outro.";
  return message;
}

export type RoomSettingsInput = {
  entry_mode: RoomEntryMode;
  queue_approval_mode: RoomQueueApprovalMode;
  require_song_confirmation: boolean;
  /**
   * Pré-aprovação de 24h (Fase 8a). É um toggle FUNCIONAL de verdade — o
   * estado OFF já está implementado e testado no banco — mas a UI o apresenta
   * travado em ON, então o host ainda não chega até ele.
   */
  pre_approval_24h: boolean;
  /**
   * Modo no-stop (Fase 19, migration `20261014000001`): pedir música sem
   * aprovação, várias ativas por pessoa até `max_active_songs`.
   */
  no_stop: boolean;
  /** Teto de músicas ativas por participante no no-stop (1–10). */
  max_active_songs: number;
};

export async function updateRoomSettingsAction(
  roomId: string,
  settings: RoomSettingsInput
): Promise<{ ok: boolean; error?: string }> {
  if (
    !Number.isInteger(settings.max_active_songs) ||
    settings.max_active_songs < 1 ||
    settings.max_active_songs > 10
  ) {
    return { ok: false, error: "O limite de músicas por pessoa deve ser de 1 a 10." };
  }

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
  // Fase 17: o card "Como a sala funciona" mora em `/salas/[codigo]/sala`.
  revalidatePath("/salas/[codigo]/sala", "page");
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
  // Fase 17: abrir/fechar também muda a tela `Player` (controles e fila do host).
  revalidatePath("/salas/[codigo]/player", "page");
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
  // Fase 17: abrir/fechar também muda a tela `Player` (controles e fila do host).
  revalidatePath("/salas/[codigo]/player", "page");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Grava (ou apaga) a chave de API do YouTube da sala.
 *
 * Desde a `20260930000038` isso NÃO é mais `update rooms set youtube_api_key`:
 * a coluna saiu do alcance do papel `authenticated` por ACL de coluna (F1/F2 da
 * auditoria de RLS), e a escrita passa pela RPC `admin_set_room_youtube_api_key`,
 * que é `security definer` e só obedece ao dono da sala. O efeito colateral
 * pretendido: a coluna deixa de ter qualquer caminho de escrita pelo cliente, e
 * o erro de "não é o dono" volta em português de dentro do banco.
 */
export async function updateYoutubeKeyAction(
  roomId: string,
  apiKey: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const trimmed = apiKey?.trim() || null;

  const { data, error } = await supabase.rpc("admin_set_room_youtube_api_key", {
    p_room_id: roomId,
    p_api_key: trimmed,
  });
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível salvar a chave do YouTube."),
    };
  }
  if (data !== true) {
    return {
      ok: false,
      error: "Só o dono pode configurar a chave do YouTube da sala.",
    };
  }

  revalidatePath("/salas/[codigo]", "page");
  // Fase 17: a chave do YouTube virou card da tela do bar.
  revalidatePath("/bar/[codigo]", "page");
  return { ok: true };
}

/**
 * Filtro de conteúdo explícito da busca do YouTube (item 6 da validação no
 * aparelho) — toggle host-only que escreve `rooms.youtube_safe_search`
 * (privilégio de coluna concedido na `20261012000003`). Ligado = `safeSearch=
 * strict`; desligado = `none`. A busca da sala lê a coluna em `getRoomContext`.
 */
export async function updateYoutubeSafeSearchAction(
  roomId: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (typeof enabled !== "boolean") {
    return { ok: false, error: "Valor inválido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .update({ youtube_safe_search: enabled })
    .eq("id", roomId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(
        error.message,
        "Não foi possível salvar o filtro de conteúdo."
      ),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Só o dono pode mudar o filtro da sala." };
  }

  revalidatePath("/salas/[codigo]", "page");
  // O card vive em `/bar/[codigo]`.
  revalidatePath("/bar/[codigo]", "page");
  return { ok: true };
}

/** Cancela o próprio pedido de entrada enquanto ele está `pending` (RLS já
 * permite auto-delete). Quem já está `approved` usa `leaveRoomAction`. */
export async function cancelEntryRequestAction(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("status", "pending")
    .select("user_id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível cancelar o pedido."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Você não tem nenhum pedido aguardando aprovação." };
  }
  revalidatePath("/entrar");
  revalidatePath("/salas/[codigo]", "page");
  // Fase 17: abrir/fechar também muda a tela `Player` (controles e fila do host).
  revalidatePath("/salas/[codigo]/player", "page");
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
    .select("code, bar_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return { ok: false, error: "Sala não encontrada." };
  }
  if (room.code === normalized) {
    return { ok: true, newCode: normalized };
  }

  // Item 3 da validação no aparelho: o código de entrada é UM só (o do bar).
  // Sala com bar vinculado troca pelo RPC `update_bar_code`, que valida a
  // unicidade no banco e espelha o código novo na sala. Só a sala órfã (sem
  // bar, caso legado) cai no caminho antigo de escrever em `rooms`.
  if (room.bar_id) {
    const { data, error } = (await supabase.rpc("update_bar_code", {
      p_bar_id: room.bar_id,
      p_code: normalized,
    })) as { data: unknown; error: { message: string } | null };
    if (error) {
      return {
        ok: false,
        error: friendlyError(error.message, "Não foi possível trocar o código."),
      };
    }
    const newCode = typeof data === "string" ? data : normalized;
    revalidatePath("/salas/[codigo]", "page");
    revalidatePath("/salas/[codigo]/sala", "page");
    revalidatePath("/bar/[codigo]", "page");
    return { ok: true, newCode };
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

  // A conta foi desconectada e o refresh_token revogado no Google, mas esta
  // instância ainda pode ter o access token em cache (55 min). Sem esta linha,
  // o bar continuaria buscando com a conta que o dono acabou de remover — e o
  // botão "desconectar" pareceria não ter efeito.
  invalidateCachedHostToken(user.id);

  revalidatePath("/salas/[codigo]", "page");
  // Fase 17: o card "Busca de música" fica em `/bar/[codigo]`.
  revalidatePath("/bar/[codigo]", "page");
  return { ok: true };
}
