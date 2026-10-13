"use client";

import { normalizeRoomCode } from "@/lib/rooms/utils";
import { createClient } from "@/lib/supabase/client";
import { subscribeWhileVisible } from "@/lib/supabase/visibility-channel";

/**
 * Canal do player (Fase 6/7).
 *
 * O player é `anon` (TV sem sessão) e a RLS de `rooms`/`queue_items` bloqueia
 * `postgres_changes` para ele — então quem avisa a TV é o **host**, por
 * broadcast, depois de gravar o playback no banco. O canal é público e chaveado
 * pelo CÓDIGO da sala (a TV não conhece o `room_id`: a URL só traz código +
 * token). Um eventinho de "releia o estado" não dá acesso a nada: quem
 * relê ainda precisa do token para `get_player_state`.
 *
 * Mesmo com broadcast, o quiosque mantém poll de 5s: TV boa é a que volta
 * sozinha depois de horas de rede, sleep do aparelho ou reconexão do WebSocket.
 */
export function playerChannelName(roomCode: string): string {
  return `player-${normalizeRoomCode(roomCode)}`;
}

const EVENT = "playback-changed";

/**
 * Avisa a TV depois de um ajuste de playback (ou de trocar o link).
 *
 * Entrega por **REST** (`httpSend`), não por WebSocket — mesma troca da
 * `announceQueueChange` (`room-channel.ts`): o emissor não abre canal, não
 * espera `SUBSCRIBED` e não segura socket; é um `POST` que o servidor entrega
 * aos assinantes do tópico. Requer Realtime server v2.97.0+ (Cloud está em dia).
 */
export async function announcePlaybackChange(roomCode: string): Promise<void> {
  try {
    // O client no try: o playback já está gravado no banco, e um aviso
    // best-effort não pode virar erro na tela de quem apertou o botão.
    const supabase = createClient();
    const channel = supabase.channel(playerChannelName(roomCode));
    try {
      await channel.httpSend(EVENT, { at: Date.now() });
    } finally {
      // Nunca assinamos: o canal só existe para dar contexto (URL/tópico) ao
      // POST. O cleanup evita acumular objetos de canal na memória do client.
      void supabase.removeChannel(channel);
    }
  } catch {
    // Sem realtime, a TV continua funcionando pelo poll.
  }
}

/** Assina o canal e chama `onChange` a cada aviso do host. */
export function subscribeToPlaybackChanges(
  roomCode: string,
  onChange: () => void
): () => void {
  // Aba oculta não segura socket (`visibility-channel.ts`, §8.4 item 2); a TV
  // fica sempre visível, e ao voltar o `SUBSCRIBED`/poll reconcilia o estado.
  return subscribeWhileVisible(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(playerChannelName(roomCode))
      .on("broadcast", { event: EVENT }, () => onChange())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  });
}
