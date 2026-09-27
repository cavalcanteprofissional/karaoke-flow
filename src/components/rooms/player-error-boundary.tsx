"use client";

import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type PlayerErrorBoundaryProps = {
  children: ReactNode;
};

type PlayerErrorBoundaryState = {
  failed: boolean;
};

/**
 * Rede de segurança da tela do player (Fase 8a, correção do player).
 *
 * Motivo: em 2026-09-27 a TV caía no `player.loadVideoById is not a function` e
 * a exceção subia até a raiz do React — overlay vermelho no dev, tela morta em
 * produção, e nenhuma forma de a sala se recuperar. O player é código de
 * terceiro dentro de um iframe: exceção ali não pode matar a tela da TV.
 *
 * **Por que este boundary fica acima do quiosque, e não em volta do stage:** o
 * erro original não nascia no stage, e sim no efeito do quiosque que chamava
 * `stage.load()`. Um boundary só captura o que acontece na renderização e nos
 * efeitos dos **seus descendentes** — em volta do stage ele não pegaria nem o
 * crash que motivou isto. A proteção primária do player é o próprio stage (que
 * só chama método depois do `onReady` real e checa a existência do método
 * antes); este boundary é a rede para todo o resto da tela.
 */
export class PlayerErrorBoundary extends Component<
  PlayerErrorBoundaryProps,
  PlayerErrorBoundaryState
> {
  state: PlayerErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PlayerErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Chega aqui também no dev, que mostra o overlay por cima: o console
    // ajuda a diagnosticar sem virar a única pista de quem está na sala.
    console.error("[player] a tela do player quebrou:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex h-dvh items-center justify-center bg-black p-8 text-white">
        <div className="flex max-w-xl flex-col items-center gap-5 text-center">
          <p className="text-3xl font-bold">Não foi possível tocar esta música</p>
          <p className="text-lg text-zinc-400">
            Pule pelo controle do dono da sala, ou toque abaixo para tentar de novo.
          </p>
          <Button
            size="lg"
            className="h-16 rounded-2xl px-8 text-xl"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-6" />
            Recarregar o player
          </Button>
        </div>
      </div>
    );
  }
}
