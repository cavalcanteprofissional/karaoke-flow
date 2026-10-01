"use client";

import { useEffect, useRef } from "react";
import { Play, Volume2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlayerState } from "@/lib/rooms/playback";

/**
 * O toque de partida da TV (Fase 8) — obrigatório, e ANTES do player existir.
 *
 * Por que um estado e não um overlay sobre o vídeo:
 *
 *   - o IFrame Player API é montado já desarmado, ou seja FORA de um gesto do
 *     usuário. Aí o `playVideo()` do quiosque cairia fora da janela de ativação e
 *     o browser negaria o áudio com o erro 150. Montando o player já dentro do
 *     toque, o primeiro play cai na janela e o gate vira a prova de que o gesto
 *     aconteceu;
 *   - os termos do YouTube proíbem overlay sobre o player, e o quiosque já
 *     tinha um (o "toque para começar" reativo, que só aparecia quando o browser
 *     bloqueava). O gate é a tela inteira antes do player, não uma camada por
 *     cima;
 *   - TV desarmada não baixa vídeo nenhum.
 *
 * Por que o botão é um `<button>` nativo e autofocus: quem navega é o D-pad do
 * controle (Enter/OK num button foca = dispara) ou o dedo num celular. React
 * bloqueia `autoFocus` no SSR, então o foco vai por `ref` + `useEffect`.
 */

/** Fase 1 = nem touch arrived, fase 2 = o browser recusou (erro 150). */
export type PlayerGatePhase = 1 | 2;

export type PlayerGateProps = {
  roomCode: string;
  state: PlayerState;
  phase: PlayerGatePhase;
  /** `false` = o player nem foi montado porque a TV está sem rede/token. */
  onStart: () => void;
  onRetry: () => void;
  onUnlockAudio: () => void;
};

/** Frase do cabeçalho: a TV é lida de longe, o código confirma a sala. */
export function playerGateTitle(state: PlayerState, phase: PlayerGatePhase): string {
  if (phase === 2) return "O navegador recusou o som";
  return `Sala ${state.room.code}`;
}

/** Uma linha de instrução. `phase` 2 assume que a tela 1 já foi mostrada. */
export function playerGateHint(state: PlayerState, phase: PlayerGatePhase): string {
  if (phase === 2) {
    return "Toque de novo. Se não sair som, toque no botão abaixo e o vídeo começa mudo.";
  }
  const waiting = state.queue.length;
  if (waiting > 0) {
    const faixa = waiting === 1 ? "1 música aprovada" : `${waiting} músicas aprovadas`;
    return `Toque ou pressione OK para começar ${faixa}.`;
  }
  return "Toque ou pressione OK para começar.";
}

/**
 * Botão principal do gate. A ordem das tentativas é:
 * 1. tenta o play dentro do gesto (o caminho normal, e o que monta o player);
 * 2. o browser recusou → mesmo gesto, com a Wayback Machine: iniciar mudo e
 *    destravar o som no clique seguinte. O destrave funciona porque aquele
 *    clique é um gesto novo, inteiro.
 */
export function PlayerGate({
  roomCode,
  state,
  phase,
  onStart,
  onRetry,
  onUnlockAudio,
}: PlayerGateProps) {
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Quem chega na TV não tem teclado nem mouse: o foco tem que já estar no botão
    // quando a tela aparece, senão o primeiro OK do controle vai para o body.
    startRef.current?.focus();
  }, [roomCode]);

  return (
    <div
      // `bg-black` opaco de propósito: na fase "tentar de novo" o player está
      // montado atrás (o vídeo não saiu do primeiro frame), e uma tela
      // semitransparente seria um overlay sobre o player — a mesma coisa que os
      // termos do YouTube não permitem. Aqui a tela substitui o player.
      className="flex size-full flex-col items-center justify-center gap-8 bg-black p-8 text-center"
      data-testid="player-gate"
      data-phase={phase}
    >
      <div className="flex flex-col gap-3">
        <p className="text-5xl font-bold tracking-tight sm:text-7xl">
          {playerGateTitle(state, phase)}
        </p>
        <p className="text-2xl text-zinc-300 sm:text-3xl">{playerGateHint(state, phase)}</p>
      </div>

      {phase === 1 ? (
        <Button
          ref={startRef}
          size="lg"
          className="h-28 w-full max-w-2xl text-4xl"
          onClick={onStart}
        >
          <Play className="size-12" />
          Toque ou pressione OK para começar
        </Button>
      ) : (
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <Button size="lg" className="h-28 w-full text-4xl" onClick={onRetry}>
            <Play className="size-12" />
            Tentar de novo
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-20 w-full text-2xl"
            onClick={onUnlockAudio}
          >
            <Volume2 className="size-8" />
            Começar sem som
          </Button>
        </div>
      )}

      <p className="flex max-w-xl items-center gap-2 text-lg text-zinc-500">
        <WifiOff className="size-5" />
        A TV continua acompanhando a fila. Quem estiver no celular pode pedir música pelo
        QR.
      </p>
    </div>
  );
}
