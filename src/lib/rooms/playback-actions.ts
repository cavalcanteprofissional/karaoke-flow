"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";
import { parsePlayerState, playbackActionSchema, playerTokenSchema } from "./playback";
import type { PlayerStateResult, PlaybackAction } from "./playback";

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  return message;
}

/**
 * Estado da tela do player (Fase 6). Vai por `get_player_state`, que é
 * `security definer` e confere o token dentro da função — a TV não tem sessão
 * e não é membro de nada, então a RLS de `rooms`/`queue_items` não se aplica a
 * ela. É a mesma leitura usada no primeiro render da página e no polling do
 * quiosque (o canal realtime é o caminho rápido, o poll é a rede de
 * segurança para a TV ficar de pé por horas).
 */
export async function getPlayerStateAction(
  roomCode: string,
  token: string
): Promise<PlayerStateResult> {
  const code = normalizeRoomCode(roomCode);
  const parsedToken = playerTokenSchema.safeParse(token);
  if (!parsedToken.success) {
    return { ok: false, error: "Player inválido.", code: "PLAYER_INVALID" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_player_state", {
    p_room_code: code,
    p_token: parsedToken.data,
  });

  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível ler o player."),
      code: "PLAYER_READ_FAILED",
    };
  }

  return parsePlayerState(data);
}

/**
 * Auto-avanço do player (Fase 6): o quiosque chama quando a faixa termina (e
 * no boot, se a sala estiver ociosa com algo aprovado). O banco decide o que
 * entra — sob advisory lock, só `approved`, e `paused` não pula nada.
 *
 * `finishedItemId` é o item que acabou de terminar: sem ele, o banco só pega a
 * fila se a sala estiver ociosa (nunca pula o que está no ar), e com ele a
 * claim é idempotente (duas abas da TV não pulam a música duas vezes).
 */
export async function claimNextSongAction(
  roomCode: string,
  token: string,
  finishedItemId?: string | null
): Promise<
  | { ok: true; playbackStatus: string; item: unknown }
  | { ok: false; error: string; code: string }
> {
  const code = normalizeRoomCode(roomCode);
  const parsedToken = playerTokenSchema.safeParse(token);
  if (!parsedToken.success) {
    return { ok: false, error: "Player inválido.", code: "PLAYER_INVALID" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_next_song", {
    p_room_code: code,
    p_token: parsedToken.data,
    p_finished_item_id: finishedItemId ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível avançar a fila."),
      code: "CLAIM_FAILED",
    };
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    playback_status?: string;
  } | null;
  if (!result || result.ok !== true) {
    return {
      ok: false,
      error: result?.error ?? "Não foi possível avançar a fila.",
      code: "CLAIM_REJECTED",
    };
  }

  return {
    ok: true,
    playbackStatus: result.playback_status ?? "idle",
    item: (data as { item?: unknown }).item ?? null,
  };
}

/**
 * Ajuste de playback do host (Fase 7): `play` toca/retoma, `pause` segura,
 * `skip` termina a atual e toca a próxima, `stop` termina e deixa a sala
 * ociosa. A autorização é do banco (`set_playback` exige `is_host`); aqui só
 * validamos o comando e traduzimos a exceção em toast.
 */
export async function setPlaybackAction(
  roomId: string,
  action: unknown,
  itemId?: string
): Promise<
  { ok: true; action: PlaybackAction } | { ok: false; error: string; code: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para controlar o player.",
      code: "UNAUTHENTICATED",
    };
  }

  const parsedAction = playbackActionSchema.safeParse(action);
  if (!parsedAction.success) {
    return { ok: false, error: "Comando inválido.", code: "VALIDATION" };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("code")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return { ok: false, error: "Sala não encontrada.", code: "ROOM_NOT_FOUND" };
  }

  const { data, error } = await supabase.rpc("set_playback", {
    p_room_id: roomId,
    p_action: parsedAction.data,
    p_item_id: itemId ?? null,
  });

  if (error) {
    const message = error.message;
    if (/nada para tocar/i.test(message)) {
      return {
        ok: false,
        error: "Nenhuma música aprovada na fila para tocar.",
        code: "QUEUE_EMPTY",
      };
    }
    if (/nada tocando/i.test(message)) {
      return { ok: false, error: "Não tem música tocando.", code: "NOTHING_PLAYING" };
    }
    return {
      ok: false,
      error: friendlyError(message, "Não foi possível controlar o player."),
      code: "PLAYBACK_FAILED",
    };
  }
  if (data !== true) {
    return {
      ok: false,
      error: "Só o dono da sala pode controlar o player.",
      code: "FORBIDDEN",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  return { ok: true, action: parsedAction.data };
}

/**
 * Rotaciona o token do player (Fase 6, P1): o host abre a URL da TV e, se
 * vazar, gera outra — a antiga morre na hora. Também é o botão "Abrir player
 * na TV" do primeiro uso.
 */
export async function rotatePlayerTokenAction(
  roomId: string
): Promise<{ ok: true; token: string } | { ok: false; error: string; code: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para gerar o link do player.",
      code: "UNAUTHENTICATED",
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

  const { data, error } = await supabase.rpc("rotate_player_token", {
    p_room_id: roomId,
  });

  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível gerar o link do player."),
      code: "ROTATE_FAILED",
    };
  }
  const parsedToken = playerTokenSchema.safeParse(data);
  if (!parsedToken.success) {
    return {
      ok: false,
      error: "Só o dono da sala pode gerar o link do player.",
      code: "FORBIDDEN",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  return { ok: true, token: parsedToken.data };
}
