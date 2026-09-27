"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Integração com a YouTube IFrame Player API (Fase 6).
 *
 * Duas regras de produto que moldaram o componente:
 *  - "sem overlays sobre o player" (restrição de TOS): a tela do quiosque não
 *    desenha nada por cima do vídeo, então tudo que é UI fica na faixa inferior;
 *  - autoplay: navegador com áudio bloqueia autoplay sem gesto do usuário, então
 *    o primeiro start pode virar um pedido de toque — daí `onBlocked` e o
 *    CTA de "toque para começar" (o componente não inventa o desbloqueio: quem
 *    decide é o gesto real).
 *
 * A API é carregada por script e o player é imperativo (`useImperativeHandle`):
 * é o mesmo player quem recebe `play/pause/load` quando o estado muda, sem
 * remontar o iframe (remontar recarregaria o vídeo e piscaria a tela da TV).
 */

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** Erro 150: o YouTube recusou autoplay com áudio (falta gesto do usuário). */
export const YT_ERROR_AUTOPLAY_BLOCKED = 150;

type YtPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  loadVideoById(videoId: string, startSeconds: number): void;
  getCurrentTime(): number;
  destroy(): void;
};

type YtEvents = {
  onReady?: () => void;
  onStateChange?: (event: { data: number; target: YtPlayer }) => void;
  onError?: (event: { data: number }) => void;
};

type YtNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: { videoId?: string; playerVars?: Record<string, unknown>; events?: YtEvents }
  ) => YtPlayer;
};

type WindowWithYt = Window & {
  YT?: YtNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

const API_SRC = "https://www.youtube.com/iframe_api";

let apiPromise: Promise<YtNamespace> | null = null;

/**
 * Carrega a IFrame API uma vez por página. Se `window.YT` já existir (teste ou
 * segunda montagem) resolve direto, sem injetar script.
 */
export function loadYouTubeIframeApi(): Promise<YtNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Player do YouTube só existe no navegador."));
  }
  const w = window as WindowWithYt;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YtNamespace>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (w.YT?.Player) resolve(w.YT);
    };

    if (document.querySelector(`script[src="${API_SRC}"]`)) return;

    const script = document.createElement("script");
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("Não foi possível carregar o player do YouTube."));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

export type YouTubeStageHandle = {
  /** Carrega um vídeo (reinicia do início ou de `startSeconds`). */
  load: (videoId: string, startSeconds?: number | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
};

export type YouTubeStageProps = {
  className?: string;
  /**
   * Disparado assim que a INSTÂNCIA do player existe (o `new YT.Player` já
   * rodou). A IFrame API aceita `loadVideoById` nesse momento — a chamada fica
   * na fila interna e roda quando o iframe fica pronto — e é o que permite ao
   * quiosque aplicar o estado do banco já no primeiro render, sem esperar o
   * evento `onReady` do YouTube (que chegaria tarde para a TV).
   */
  onReady?: () => void;
  onEnded?: (videoId: string) => void;
  /** Autoplay recusado (erro 150) ou vídeo que não entrou em play. */
  onBlocked?: () => void;
  onError?: (code: number) => void;
};

export const YouTubeStage = forwardRef<YouTubeStageHandle, YouTubeStageProps>(
  function YouTubeStage({ className, onReady, onEnded, onBlocked, onError }, ref) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YtPlayer | null>(null);
    const videoIdRef = useRef<string | null>(null);
    const playProbeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbacks = useRef({ onEnded, onBlocked, onError });
    callbacks.current = { onEnded, onBlocked, onError };

    const clearBlockedProbe = useCallback(() => {
      if (playProbeRef.current) {
        clearTimeout(playProbeRef.current);
        playProbeRef.current = null;
      }
    }, []);

    const armBlockedProbe = useCallback(() => {
      clearBlockedProbe();
      playProbeRef.current = setTimeout(() => {
        playProbeRef.current = null;
        callbacks.current.onBlocked?.();
      }, 1500);
    }, [clearBlockedProbe]);

    useImperativeHandle(
      ref,
      () => ({
        load(videoId: string, startSeconds?: number | null) {
          const player = playerRef.current;
          if (!player) return;
          videoIdRef.current = videoId;
          player.loadVideoById(videoId, startSeconds ?? 0);
          // O vídeo que acabou de carregar começa a tocar por conta própria
          // (playerVars.autoplay); se o navegador recusar, o probe abaixo
          // dispara o CTA de toque.
          armBlockedProbe();
        },
        play() {
          playerRef.current?.playVideo();
          armBlockedProbe();
        },
        pause() {
          playerRef.current?.pauseVideo();
          clearBlockedProbe();
        },
        stop() {
          playerRef.current?.stopVideo();
          videoIdRef.current = null;
          clearBlockedProbe();
        },
      }),
      [armBlockedProbe, clearBlockedProbe]
    );

    useEffect(() => {
      let cancelled = false;

      void loadYouTubeIframeApi()
        .then((YT) => {
          if (cancelled || !hostRef.current) return;
          playerRef.current = new YT.Player(hostRef.current, {
            playerVars: {
              autoplay: 1,
              controls: 1,
              rel: 0,
              fs: 0,
              playsinline: 1,
              iv_load_policy: 3,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                clearBlockedProbe();
                onReady?.();
              },
              onStateChange: (event) => {
                if (event.data === YT_STATE.PLAYING) {
                  clearBlockedProbe();
                  return;
                }
                if (event.data === YT_STATE.ENDED && videoIdRef.current) {
                  clearBlockedProbe();
                  const finished = videoIdRef.current;
                  videoIdRef.current = null;
                  callbacks.current.onEnded?.(finished);
                }
              },
              onError: (event) => {
                if (event.data === YT_ERROR_AUTOPLAY_BLOCKED) {
                  callbacks.current.onBlocked?.();
                  return;
                }
                callbacks.current.onError?.(event.data);
              },
            },
          });
          onReady?.();
        })
        .catch(() => {
          callbacks.current.onError?.(-1);
        });

      return () => {
        cancelled = true;
        clearBlockedProbe();
        playerRef.current?.destroy();
        playerRef.current = null;
      };
      // Monta uma vez: o player é imperativo e sobrevive à mudança de estado.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={hostRef} className={className} data-testid="youtube-stage" />;
  }
);
