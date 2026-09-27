"use client";

import { normalizeRoomCode } from "@/lib/rooms/utils";
import { createClient } from "@/lib/supabase/client";

/**
 * Canal da FILA (2026-09-27, correção do "a lista do participante não atualiza").
 *
 * O sintoma reportado era o pior possível de diagnosticar: aprovarei uma música, a
 * lista do celular não mudou, e nada no código dizia por quê. A causa não era
 * uma — são três, e nenhuma delas dá para resolver com o que a tela tinha:
 *
 *  1. `postgres_changes` depende de a tabela estar na publicação
 *     `supabase_realtime` **e** de a RLS deixar o participante ler a linha no
 *     momento do evento. Se qualquer um dos dois não valer para o celular, a
 *     assinatura sobe e nunca chega nada — silenciosamente;
 *  2. celular de participante trava a tela, o SO dorme o WebSocket e a
 *     reconexão só acontece quando o app volta ao primeiro plano;
 *  3. aprovação, rejeição, remoção e reordenação aconteciam em dispositivos
 *     diferentes, e o aviso de que a fila mudou era transmitido apenas para a
 *     TV (`announcePlaybackChange`). O participante não tinha NENHUM caminho
 *     rápido: só o poll de 5s da tela do player, que é do player, não da fila.
 *
 * A correção é redundância em camadas, nesta ordem de confiança:
 * broadcast (quem mutou avisa, sem depender de RLS nem de publicação) → poll de
 * 10s (rede, sono e falha de realtime se recuperam sozinhos) → relê na
 * visibilidade/foco (o caso real do bar: a tela do celular estava travada).
 *
 * O canal é público e chaveado pelo CÓDIGO, como o do player, e o evento não
 * carrega nada: é só "releia". Quem relê passa pela RLS de sempre — o broadcast
 * não abre brecha nenhuma.
 */
export function roomQueueChannelName(roomCode: string): string {
  return `room-queue-${normalizeRoomCode(roomCode)}`;
}

const EVENT = "queue-changed";

/** Estado da assinatura, para o console — falha de realtime tem que aparecer. */
export type QueueChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/**
 * Avisa os aparelhos da sala depois de qualquer mutação da fila. Nunca lança:
 * quem mutou já gravou no banco, e falhar o aviso só custaria a atualização —
 * o poll de quem está ouvindo conserta.
 */
export async function announceQueueChange(roomCode: string): Promise<void> {
  try {
    // O client também entra no try: se ele nem existe (variável de ambiente
    // faltando), quem mutou a fila já gravou no banco e não pode virar erro na
    // tela por causa de um aviso que é best-effort.
    const supabase = createClient();
    const channel = supabase.channel(roomQueueChannelName(roomCode));
    try {
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
      });
      await channel.send({
        type: "broadcast",
        event: EVENT,
        payload: { at: Date.now() },
      });
    } finally {
      void supabase.removeChannel(channel);
    }
  } catch {
    // Sem realtime: quem está ouvindo ainda tem o poll e a relê no foco.
  }
}

/**
 * Assina o canal e chama `onChange` a cada aviso. `onStatus` existe para o
 * diagnóstico: assinatura que falha precisa aparecer em algum lugar, senão o
 * próximo "não atualiza" volta a ser caça ao tesouro.
 */
export function subscribeToQueueChanges(
  roomCode: string,
  onChange: () => void,
  onStatus?: (status: QueueChannelStatus) => void
): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(roomQueueChannelName(roomCode))
    .on("broadcast", { event: EVENT }, () => onChange())
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatus?.(status);
        return;
      }
      // CHANNEL_ERROR/TIMED_OUT são falhas de verdade; CLOSED é o teardown.
      if (status !== "CLOSED") onStatus?.(status as QueueChannelStatus);
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
