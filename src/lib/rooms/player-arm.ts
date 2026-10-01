"use client";

import { useSyncExternalStore } from "react";

/**
 * "A TV está armada" (Fase 8) — a decisão de deixar o player tocar fica no
 * aparelho, não no React, e isso é uma escolha de arquitetura, não um detalhe:
 *
 *  - **o valor só existe no browser.** O quiosque é SSR-rendered, então o HTML
 *    do servidor precisa ser *idêntico* ao primeiro render do cliente. Ler o
 *    `localStorage` no `useState` inicial faz o servidor mandar o gate e o
 *    cliente mandar o vídeo — hydration mismatch, que o Next 16 mostra como
 *    "Recoverable Error" e a TV paga com a árvore regenerada. Foi exatamente o
 *    que aconteceu na primeira versão deste gate;
 *  - **`useSyncExternalStore` é a resposta da biblioteca para isso**, e resolve
 *    os dois problemas de uma vez: `getServerSnapshot` é o que o servidor viu
 *    (sempre `false`), e o `getSnapshot` do browser entra em vigor na
 *    hidratação, sem `setState` dentro de efeito (que o `react-hooks` proíbe e que,
 *    de todo modo, devolveria o gate por um frame);
 *  - **o `localStorage` é a fonte da verdade.** A versão anterior espelhava o
 *    estado do React no storage com um efeito, mais um estado `audioUnlocked`
 *    para "não insistir" — e esse segundo estado fazia "Trancar TV" não travar
 *    depois que a faixa tocava. Sem espelho, não existe o que divergir: travar
 *    limpa a chave e a tela volta ao gate no mesmo instante.
 *
 * Escrever dispara um evento próprio porque o `storage` do browser **não
 * dispara na aba que escreveu** — sem ele, o clique no botão do gate não
 * re-renderizaria nada.
 */

const ARM_EVENT = "kf:player-arm";

/**
 * Rede de segurança para TV **sem** storage utilizável (modo privado, cota
 * estourada, smart TV com DOM storage desabilitado). Sem isto, o clique no
 * botão do gate seria engolido — a escrita falharia, a leitura continuaria
 * `false` e a TV ficaria presa na tela de "começar" para sempre, que é bem pior
 * do que não persistir nada. Com isto, a sessão funciona igual; o que se perde
 * é só a memória do "armed" depois de um F5.
 */
const inMemoryArmed = new Set<string>();

/** Só para os testes: a memória do store sobrevive entre casos. */
export function resetPlayerArmInMemory(): void {
  inMemoryArmed.clear();
}

/** Chave por sala: travar a TV de um cômodo não afeta o bar de outro. */
export function playerArmKey(roomCode: string): string {
  return `kf:player-armed:${roomCode}`;
}

/**
 * A TV já foi armada neste aparelho? `false` no servidor, e sem
 * `localStorage` cai na memória da sessão (ver `inMemoryArmed`).
 */
export function readPlayerArmed(roomCode: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(playerArmKey(roomCode)) === "1";
  } catch {
    return inMemoryArmed.has(roomCode);
  }
}

/**
 * O que o SERVIDOR renderizou, e por isso o que o primeiro render do cliente
 * tem que renderizar também. `false` é o gate — nunca "o que estiver no
 * storage", que o servidor não tem como saber.
 */
export function readPlayerArmedOnServer(): boolean {
  return false;
}

function subscribePlayerArm(onStoreChange: () => void): () => void {
  window.addEventListener(ARM_EVENT, onStoreChange);
  // Outra aba (outro player, outra tela) mexeu na chave.
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(ARM_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * A TV foi armada ou travada. Grava e avisa os assinantes: quem chama isto é a
 * tela (o clique do botão), e a re-renderização vem do store, não de um
 * `setState` paralelo.
 */
export function setPlayerArmed(roomCode: string, armed: boolean): void {
  if (typeof window === "undefined") return;
  // A memória é atualizada sempre (e não só quando o storage funciona) para
  // que a rede de segurança esteja pronta caso ele falhe no meio da sessão.
  if (armed) {
    inMemoryArmed.add(roomCode);
  } else {
    inMemoryArmed.delete(roomCode);
  }
  try {
    if (armed) {
      window.localStorage.setItem(playerArmKey(roomCode), "1");
    } else {
      window.localStorage.removeItem(playerArmKey(roomCode));
    }
  } catch {
    // Sem storage, a memória acima já segura a sessão.
  }
  window.dispatchEvent(new Event(ARM_EVENT));
}

/** A TV está armada? Fonte externa, com snapshot de servidor. */
export function usePlayerArmed(roomCode: string): boolean {
  return useSyncExternalStore(
    subscribePlayerArm,
    () => readPlayerArmed(roomCode),
    readPlayerArmedOnServer
  );
}
