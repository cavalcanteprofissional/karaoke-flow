"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { subscribeToQueueChanges } from "@/lib/rooms/room-channel";
import { ownActiveSongView, type OwnActiveSongView } from "@/lib/rooms/queue";

/**
 * A música ativa do próprio participante, **ao vivo** (Fase 8g, 2026-10-05).
 *
 * ── O defeito que isto resolve ────────────────────────────────────────────────
 * "Dá para pedir a próxima, mas demora." A tela de busca recebe
 * `ownActiveSong` como prop de um Server Component: o servidor lê a fila uma vez
 * por render. A música que estava tocando vira `played` **na TV**, por dentro
 * da RPC `claim_next_song` — que não emite nada para o celular do cliente. O
 * botão continuava travado com o texto "você já tem uma música tocando" até o
 * próximo render do servidor, e o próximo render vinha de navegar ou dar F5.
 * Quem espera a música terminar para pedir a seguinte ficava olhando um botão
 * morto sem nenhum sinal de que a música já tinha acabado.
 *
 * ── Duas camadas: o `postgres_changes` saiu (2026-10-13) ──────────────────────
 * A versão original tinha três: `postgres_changes` em `queue_items`, broadcast
 * `queue-changed` e poll de 10s. O `postgres_changes` saiu: ele custava **uma
 * mensagem Realtime por aparelho da sala a cada mudança de linha** — e a TV mexe
 * na fila toda vez que puxa a próxima faixa — inflando o consumo do free tier sem
 * entregar nada que as outras duas camadas já não entreguem. Quem cobre a lacuna
 * que ele fechava é a TV: `claim_next_song` e o release agora emitem
 * `announceQueueChange` (`player-kiosk.tsx`), então a virada para `played` chega
 * por broadcast, que não depende de publicação nem de RLS. Sobram:
 *
 *  1. broadcast `queue-changed` — quem mutou a fila (o app ou a TV) avisa;
 *  2. poll de 10s + relê no foco/visibilidade — TV e celular dormem, e a rede
 *     volta sozinha.
 *
 * ── A regra não mora aqui ─────────────────────────────────────────────────────
 * O cálculo é `ownActiveSongView`, a **mesma** função que o servidor usa em
 * `readOwnActiveSong`. Este arquivo só lê e publica; se ele recalcular a regra,
 * um dia a tela e a action contam histórias diferentes — que é como o defeito
 * nasceu.
 *
 * ── Falha de leitura não trava ninguém ───────────────────────────────────────
 * Se a consulta falhar, o valor fica `undefined` (não sei), que a tela trata
 * como "pode pedir". Quem decide é a trigger
 * `queue_items_one_active_per_participant`, no banco: destravar a tela só pode
 * dar um erro que a action e a trigger ainda recusam.
 */

/** Mesma cadência da fila: barata o bastante para ficar sempre ligada. */
const POLL_MS = 10_000;

/** O host nunca é travado. Constante: a identidade não muda a cada render. */
const HOST_VIEW: OwnActiveSongView = { playing: false, title: null };

export type UseOwnActiveSongInput = {
  roomId: string;
  roomCode: string;
  userId: string;
  isHost: boolean;
  /**
   * Modo no-stop (Fase 19): várias ativas até `maxActive`, sem substituição.
   * Off (default) = a regra clássica de uma ativa por participante.
   */
  noStop?: boolean;
  maxActive?: number;
  /**
   * O que o servidor já respondeu no primeiro render. Serve de valor inicial
   * (a tela não pisca "pode pedir" antes de hidratar) e de retorno se a
   * assinatura não conseguir nada.
   */
  initial?: OwnActiveSongView;
};

export function useOwnActiveSong(
  input: UseOwnActiveSongInput
): OwnActiveSongView | undefined {
  const { roomId, roomCode, userId, isHost, noStop, maxActive, initial } = input;
  const [view, setView] = useState<OwnActiveSongView | undefined>(initial);

  const fetchOwn = useCallback(async () => {
    // O host não tem o limite; não há o que ler e nada a assinar.
    if (isHost) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("queue_items")
        .select("id, title, status, position")
        .eq("room_id", roomId)
        .eq("added_by_user_id", userId)
        .in("status", ["pending", "approved", "playing"]);
      if (error || !data) return; // "não sei" — não trava, não destrava.
      setView(ownActiveSongView(data, false, { noStop, maxActive }));
    } catch {
      // Cliente sem ambiente, rede caiu, storage bloqueado: a tela segue com o
      // valor que tinha.
    }
  }, [roomId, userId, isHost, noStop, maxActive]);

  useEffect(() => {
    // O host não tem o limite: nada a ler e nada a assinar (o teste de
    // "nunca assina" fica aqui). O valor dele é devolvido na saída — não por
    // `setState` dentro do efeito, que seria uma renderização em cascata para
    // um caso que não depende de efeito nenhum.
    if (isHost) return;

    const unsubscribeBroadcast = subscribeToQueueChanges(
      roomCode,
      () => {
        void fetchOwn();
      },
      (status) => {
        // Primeira leitura quando o canal sobe — o gatilho que o antigo canal de
        // `postgres_changes` dava. Roda em callback de evento externo (não no
        // corpo do efeito), e reconcilia o `initial` sem esperar o poll de 10s.
        if (status === "SUBSCRIBED") void fetchOwn();
      }
    );

    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden")
        return;
      void fetchOwn();
    }, POLL_MS);

    const wake = () => {
      void fetchOwn();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", wake);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", wake);
      window.addEventListener("online", wake);
    }

    return () => {
      clearInterval(poll);
      unsubscribeBroadcast();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", wake);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", wake);
        window.removeEventListener("online", wake);
      }
    };
  }, [roomId, roomCode, fetchOwn, isHost]);

  // O host é isento por regra, não por leitura: devolve o valor fixo e ignora
  // qualquer coisa que a assinatura tenha deixado em `view`.
  return isHost ? HOST_VIEW : view;
}
