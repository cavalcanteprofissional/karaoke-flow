"use client";

/**
 * Realtime só com a aba visível (2026-10-13, §8.4 item 2 de
 * `docs/engenharia/limites-free-tier.md`).
 *
 * ── Por que isto existe ───────────────────────────────────────────────────────
 * 1 conexão = 1 WebSocket = 1 aba (§8.5). O `@supabase/phoenix` já reage à
 * visibilidade, mas só para **não reconectar** com a aba oculta: o socket que já
 * está aberto **continua aberto**, contando para o teto de conexões simultâneas
 * do Free (200) e para o pico do relatório. Uma aba esquecida em segundo plano
 * segura a conexão até o navegador matá-la por conta própria.
 *
 * Este módulo fecha a lacuna pelo caminho que o doc registrou: **desassinar no
 * `visibilitychange: hidden` e reassinar no retorno**. Remover o último canal do
 * client memoizado (`src/lib/supabase/client.ts`) faz o realtime-js agendar o
 * `disconnect()` (`_disconnectOnEmptyChannelsAfterMs` = 2 × heartbeat = ~50 s);
 * reassinar a tempo cancela o agendamento, então ir e voltar rápido não derruba
 * nada. Voltando depois, o próprio `subscribe()` reconecta o socket.
 *
 * ── Por que é seguro ──────────────────────────────────────────────────────────
 * Quem chama já tem, além do broadcast, um poll que pula a aba oculta e um relê
 * no `visibilitychange`/`focus`. Aba oculta ninguém está lendo e o kiosque da TV
 * fica sempre visível; ao voltar, o poll e a relê reconciliam o estado — o
 * broadcast é só o caminho rápido. Nenhum dado se perde enquanto está fechado.
 *
 * ── Sem `document` (SSR) ──────────────────────────────────────────────────────
 * Fora do browser assina direto e devolve o teardown: a visibilidade não é
 * observável e não há socket a economizar.
 */
export function subscribeWhileVisible(subscribe: () => () => void): () => void {
  if (typeof document === "undefined") {
    return subscribe();
  }

  let teardown: (() => void) | null = null;

  const start = () => {
    if (teardown) return;
    teardown = subscribe();
  };

  const stop = () => {
    if (!teardown) return;
    const off = teardown;
    teardown = null;
    off();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") stop();
    else start();
  };

  // Montar já com a aba oculta não abre socket: ninguém está lendo, e o primeiro
  // `visibilitychange` (ou o poll ao voltar) traz o estado.
  if (document.visibilityState !== "hidden") start();

  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    stop();
  };
}
