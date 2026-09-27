"use client";

import { normalizeRoomCode } from "@/lib/rooms/utils";
import { createClient } from "@/lib/supabase/client";

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

/** Avisa a TV depois de um ajuste de playback (ou de trocar o link). */
export async function announcePlaybackChange(roomCode: string): Promise<void> {
  const supabase = createClient();
  const channel = supabase.channel(playerChannelName(roomCode));
  try {
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
    await channel.send({ type: "broadcast", event: EVENT, payload: { at: Date.now() } });
  } catch {
    // Sem realtime, a TV continua funcionando pelo poll.
  } finally {
    void supabase.removeChannel(channel);
  }
}

/** Assina o canal e chama `onChange` a cada aviso do host. */
export function subscribeToPlaybackChanges(
  roomCode: string,
  onChange: () => void
): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(playerChannelName(roomCode))
    .on("broadcast", { event: EVENT }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
