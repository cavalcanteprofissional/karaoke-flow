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
 * Token do player, se houver. `null` = pedir pelo caminho da sessão.
 *
 * Duas portas, decididas aqui e conferidas no banco (`player_room_id`,
 * migration 20260927000029): token = a TV sem sessão; sem token = o dono ou um
 * membro `approved` chamando com a própria sessão. O participante NUNCA recebe
 * o token — ele navega até `/player/<codigo>` e o servidor resolve a sessão
 * dele, sem expor `rooms.player_token` no navegador.
 */
function parsePlayerTokenArg(token: string | null | undefined): string | null {
  if (!token) return null;
  const parsed = playerTokenSchema.safeParse(token);
  return parsed.success ? parsed.data : null;
}

/**
 * Estado da tela do player (Fase 6/8a). Vai por `get_player_state`, que é
 * `security definer` e confere token OU sessão dentro da função — a TV não tem
 * sessão e não é membro de nada, então a RLS de `rooms`/`queue_items` não se
 * aplica a ela. É a mesma leitura usada no primeiro render da página e no
 * polling do quiosque (o canal realtime é o caminho rápido, o poll é a rede de
 * segurança para a TV ficar de pé por horas).
 */
export async function getPlayerStateAction(
  roomCode: string,
  token: string | null = null
): Promise<PlayerStateResult> {
  const code = normalizeRoomCode(roomCode);
  const parsedToken = parsePlayerTokenArg(token);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_player_state", {
    p_room_code: code,
    p_token: parsedToken,
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
 * sempre que relê o banco e a sala está ociosa com algo aprovado). O banco
 * decide o que entra — sob advisory lock, só `approved`, e `paused` não pula
 * nada.
 *
 * `finishedItemId` é o item que acabou de terminar: sem ele, o banco só pega a
 * fila se a sala estiver ociosa (nunca pula o que está no ar), e com ele a
 * claim é idempotente (duas abas da TV não pulam a música duas vezes).
 *
 * ── Por que isto revalida a tela de busca (Fase 8g) ───────────────────────────
 * Este era o fim da "demora para pedir a próxima". A música terminada vira
 * `played` **aqui dentro**, por RPC, e o cliente que está com o celular na mão
 * não é avisado: `revalidatePath` só existia para `/salas/<code>`, então a
 * prop `ownActiveSong` da página de busca nascia velha e o botão continuava
 * travado com "você já tem uma música tocando" depois da música acabar. O
 * conserto é revalidar as duas telas — a que mostra a fila e a que pede.
 *
 * Quem está com a aba de busca **aberta** não depende disto: o `UPDATE` de
 * `queue_items` chega por `postgres_changes` no `useOwnActiveSong`. O
 * `revalidatePath` cobre quem chega por navegação, e é por isso que os dois
 * são necessários em vez de um só.
 */
export async function claimNextSongAction(
  roomCode: string,
  token: string | null = null,
  finishedItemId?: string | null
): Promise<
  | { ok: true; playbackStatus: string; item: unknown }
  | { ok: false; error: string; code: string }
> {
  const code = normalizeRoomCode(roomCode);
  const parsedToken = parsePlayerTokenArg(token);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_next_song", {
    p_room_code: code,
    p_token: parsedToken,
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

  // As duas telas que juzgam a fila: a da sala e a de pedir música.
  revalidatePath(`/salas/${code}`);
  revalidatePath(`/salas/${code}/buscar`);

  return {
    ok: true,
    playbackStatus: result.playback_status ?? "idle",
    item: (data as { item?: unknown }).item ?? null,
  };
}

/**
 * Devolve a música que a TV segurou ao ser trancada (Fase 8g/B2).
 *
 * O quiosque chama isto em "Trancar TV", ANTES de limpar a marcação de armada.
 * É a única porta que destrava o cantor: com a faixa parada em `playing`, a
 * trigger `queue_items_one_active_per_participant` recusa qualquer pedido novo
 * com `KF001` para sempre — nada mais vai disparar `onEnded`, e
 * `shouldAutoAdvance`/`shouldClaimFromIdle` já respondem `false` por estarem
 * desarmados. Devolver para `approved` (mesma posição) tira o portão e não rouba
 * a vez de ninguém.
 *
 * A TV é quem sabe que trancou: o "desarmada" vive no `localStorage` dela, não
 * em coluna nenhuma do banco (`rooms` não tem `playback_held` — a migration
 * `20260927000032` nunca existiu). Por isso a escrita é aqui, pela mesma porta
 * de `claim_next_song` (`player_room_id`: token da TV ou sessão de membro), e
 * não numa trigger que teria de adivinhar o estado da tela.
 *
 * Falha não é motivo para deixar a TV travada com a música presa: o kiosk
 * registra o que der e segue desarmando de qualquer jeito.
 */
export async function releaseCurrentItemAction(
  roomCode: string,
  token: string | null = null
): Promise<{ ok: true; released: boolean } | { ok: false; error: string; code: string }> {
  const code = normalizeRoomCode(roomCode);
  const parsedToken = parsePlayerTokenArg(token);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_current_item", {
    p_room_code: code,
    p_token: parsedToken,
  });

  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível liberar a música."),
      code: "RELEASE_FAILED",
    };
  }

  const result = data as { ok?: boolean; error?: string; released?: boolean } | null;
  if (!result || result.ok !== true) {
    return {
      ok: false,
      error: result?.error ?? "Não foi possível liberar a música.",
      code: "RELEASE_REJECTED",
    };
  }

  // As mesmas duas telas do `claimNextSongAction`: a música presa travava o
  // botão de quem pediu, e é na tela de busca que isso aparece.
  revalidatePath(`/salas/${code}`);
  revalidatePath(`/salas/${code}/buscar`);

  return { ok: true, released: result.released === true };
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

  /**
   * `/buscar` entra na lista (Fase 8g) porque `stop` e `skip` também encerram a
   * música de um participante: sem esta revalidação, quem tinha um pedido
   * tocando voltava para a busca com o botão travado por causa de um comando do
   * host, que ele nem sabe que foi dado.
   */
  revalidatePath(`/salas/${room.code}`);
  revalidatePath(`/salas/${room.code}/buscar`);
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
