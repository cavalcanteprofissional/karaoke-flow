"use client";

import { createClient } from "@/lib/supabase/client";
import { subscribeWhileVisible } from "@/lib/supabase/visibility-channel";

/**
 * Canal dos MEMBROS da sala (2026-10-13), irmão do `room-channel` (fila) e do
 * `player-channel` (playback).
 *
 * Três telas dependiam de `postgres_changes` em `room_members`, cada uma com o
 * seu canal filtrado pela sala:
 *
 *   - `entry-approval-wait`  → `entry-approval:<roomId>` (quem espera aprovação)
 *   - `pending-entries`      → `entries:<roomId>`         (o host aprova)
 *   - `room-occupancy`       → `room-occupancy:<roomId>`  (o host vê quem está)
 *
 * O `postgres_changes` custa uma mensagem de realtime por **aparelho inscrito**
 * a cada linha tocada, e ainda depende de a tabela estar na publicação
 * `supabase_realtime` e de a RLS deixar a linha passar no momento do evento — a
 * mesma caixa-preta que motivou a migração da fila. Aqui, quem mutou avisa num
 * canal de broadcast (uma mensagem para N ouvintes, sem RLS nem publicação) e
 * quem ouve relê pela RLS de sempre.
 *
 * O canal é PÚBLICO e chaveado pelo `roomId` (UUID opaco). O evento não carrega
 * dado nenhum: é só "releia". Quem relê passa pela RLS; o broadcast não abre
 * brecha — nem vaza quem está na sala, porque não transporta payload.
 */
export function roomMembersChannelName(roomId: string): string {
  return `room-members-${roomId}`;
}

const EVENT = "members-changed";

/** Estado da assinatura, para o console — falha de realtime tem que aparecer. */
export type MembersChannelStatus =
  "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/**
 * Avisa os aparelhos da sala depois de qualquer mutação de `room_members`.
 * Nunca lança: quem mutou já gravou no banco, e falhar o aviso só custaria a
 * atualização — o poll de quem está ouvindo conserta.
 *
 * Entrega por **REST** (`httpSend`), não por WebSocket, pelo mesmo motivo do
 * `announceQueueChange`: o emissor não precisa de socket nem de canal vivo, só
 * de um `POST` que o servidor replica aos assinantes do tópico.
 */
export async function announceMembersChange(roomId: string): Promise<void> {
  try {
    // O client também entra no try: se ele nem existe (variável de ambiente
    // faltando), quem mutou já gravou no banco e não pode virar erro na tela
    // por causa de um aviso que é best-effort.
    const supabase = createClient();
    const channel = supabase.channel(roomMembersChannelName(roomId));
    try {
      await channel.httpSend(EVENT, { at: Date.now() });
    } finally {
      // Nunca assinamos: o canal só existe para dar contexto (URL/tópico) ao
      // POST. O cleanup evita acumular objetos de canal na memória do client.
      void supabase.removeChannel(channel);
    }
  } catch {
    // Sem realtime: quem está ouvindo ainda tem o poll e a relê no foco.
  }
}

/**
 * Assina o canal e chama `onChange` a cada aviso. `onStatus` existe para o
 * diagnóstico e para a primeira leitura: o componente lê quando o canal sobe
 * (`SUBSCRIBED`), em vez de disparar um `useEffect` separado que violaria
 * `react-hooks/set-state-in-effect`.
 */
export function subscribeToMemberChanges(
  roomId: string,
  onChange: () => void,
  onStatus?: (status: MembersChannelStatus) => void
): () => void {
  // Aba oculta não segura socket (`visibility-channel.ts`, §8.4 item 2); ao
  // voltar, o canal sobe de novo e o `SUBSCRIBED` dispara a primeira leitura.
  return subscribeWhileVisible(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(roomMembersChannelName(roomId))
      .on("broadcast", { event: EVENT }, () => onChange())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          onStatus?.(status);
          return;
        }
        // CHANNEL_ERROR/TIMED_OUT são falhas de verdade; CLOSED é o teardown.
        if (status !== "CLOSED") onStatus?.(status as MembersChannelStatus);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  });
}
