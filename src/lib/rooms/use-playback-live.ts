"use client";

import { useCallback, useEffect, useState } from "react";

import { getPlayerStateAction } from "@/lib/rooms/playback-actions";
import { subscribeToPlaybackChanges } from "@/lib/rooms/player-channel";
import type { PlaybackStatus, PlayerState } from "@/lib/rooms/playback";

/**
 * Mesma folga do poll da fila: 10s é o intervalo que o `queue-list` já usa e
 * que não aponta o banco a cada tique de tela. Só o que muda aqui é o alvo.
 */
const POLL_MS = 10_000;

export type PlaybackLive = {
  status: PlaybackStatus;
  hasCurrent: boolean;
  queueLength: number;
};

/**
 * O card "Player da TV" antes da Fase 8g (C) era apresentacional de verdade:
 * `status`/`hasCurrent`/`queueLength` chegavam da Server Component e nunca mais
 * mudavam. O host via o card continuar dizendo "Retomar" depois de a música
 * acabar sozinha na TV, porque quem terminava era o quiosque, num RPC que não
 * faz `revalidatePath` nenhum que o React consuma na página aberta.
 *
 * A leitura usa `get_player_state` pela SESSÃO do host (`token: null`), não pelo
 * token da TV: a porta 2 de `player_room_id` resolve o dono da sala, e assim o
 * hook não precisa do token — que gira toda vez que o host clica em "Gerar novo
 * link".
 */
function fromPlayerState(state: PlayerState): PlaybackLive {
  return {
    status: state.room.playback_status,
    hasCurrent: state.current !== null,
    // Espelho exato de `page.tsx:396`: a fila do `get_player_state` traz o item
    // que está tocando junto com os aprovados, e o card conta os aprovados.
    queueLength: state.queue.filter((item) => item.status === "approved").length,
  };
}

export function usePlaybackLive(
  roomCode: string,
  initial: PlaybackLive
): PlaybackLive {
  const [live, setLive] = useState<PlaybackLive>(initial);

  const refresh = useCallback(async () => {
    const result = await getPlayerStateAction(roomCode);
    // Falha de leitura mantém o que está na tela. Uma exceção aqui viraria
    // "card travado para sempre" de novo, só que por outro motivo — e o poll
    // das próximas rodadas tenta de novo, que é para que serve a camada.
    if (!result.ok) return;
    setLive(fromPlayerState(result.state));
  }, [roomCode]);

  /**
   * As três camadas da `queue-list.tsx` (Fase 8g·C), pela mesma razão: broadcast
   * de quem mudou (a TV, depois do `claim`; o host, depois do `set_playback`),
   * poll de 10s para a sala sobreviver a rede/sono, e relê no foco — o caso do
   * bar é o host voltar ao celular depois de ter ido até a mesa.
   *
   * Sem `postgres_changes`: `rooms` não está na publicação realtime e não vai
   * entrar por causa disto; o que o card precisa (playback + fila) já vem em
   * uma leitura só, e quem mutou avisa por broadcast.
   */
  useEffect(() => {
    const unsubscribe = subscribeToPlaybackChanges(roomCode, () => void refresh());

    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void refresh();
    }, POLL_MS);

    const wake = () => void refresh();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", wake);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", wake);
      window.addEventListener("online", wake);
    }

    return () => {
      clearInterval(poll);
      unsubscribe();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", wake);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", wake);
        window.removeEventListener("online", wake);
      }
    };
  }, [roomCode, refresh]);

  return live;
}
