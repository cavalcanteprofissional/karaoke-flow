"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

/**
 * Integração com a YouTube IFrame Player API (Fase 6, corrigida em 2026-09-27).
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
 *
 * ── Regra 1: readiness real, e a intenção que chega antes dele ───────────────
 * A instância devolvida por `new YT.Player(...)` é um objeto **parcial**: ela só
 * ganha `loadVideoById`/`playVideo`/etc. quando o iframe posta o evento
 * `onReady`, e o handle documentado como confiável é o `event.target` desse
 * evento. A versão anterior deste arquivo chamava `onReady` logo depois do
 * construtor, acreditando que a API "enfileirava" a chamada — ela não enfileira,
 * ela lança `player.loadVideoById is not a function`, e a TV caía no erro logo
 * no primeiro approve.
 *
 * Então o componente só diz "pronto" quando o player está de fato reproduzível,
 * e qualquer comando que chegar antes disso fica **pendente** (a última
 * intenção de cada tipo) e é aplicado no `onReady`, nesta ordem: faixa nova →
 * play/pause. Nenhum comando se perde — que é a propriedade que importa num
 * produto em que a fila cresce a noite inteira por aprovação do host.
 *
 * ── Regra 2: `destroy()` em fase de LAYOUT (2026-09-27) ──────────────────────
 * A IFrame API destrói o player **removendo o iframe do pai**. O cleanup de
 * `useEffect` (fase passiva) roda DEPOIS de o React já ter removido o DOM: o
 * player ainda respondia eventos e o quiosque ainda montava outro stage, mas o
 * `removeChild` do YouTube era sobre um nó que não era mais filho → `NotFoundError`
 * → tela de erro na TV. Foi exatamente o que derrubou a TV em dois gatilhos
 * diferentes: a música acabando com a fila vazia e o host clicando em "Parar"
 * (nos dois, `current` vira `null` e o stage é desmontado). Por isso a destruição
 * mora num cleanup de `useLayoutEffect`, que o React roda no commit, ANTES de
 * mexer no DOM — com `try/catch` como segunda rede, porque a ordem do DOM do
 * player é território do YouTube, não nosso.
 *
 * ── Regra 3: quem pede o gesto é o quiosque, não o stage ─────────────────────
 * O quiosque relê o estado a cada 5s (poll) e reaplica `play()` a cada leitura
 * (o objeto `current` é novo a cada fetch). Com o pedido de gesto armado em
 * todo `play()`, a TV mostrava o CTA de "toque para começar" voltando sem parar
 * por cima de um vídeo que já estava tocando. O probe continua existindo (é ele
 * que descobre o erro 150 antes de a tela ficar preta), mas o CTA saiu do quiosque:
 * hoje o toque de partida é o `PlayerGate`, uma tela INTEIRA que aparece antes do
 * player existir, e este componente só precisa dizer "não começou" (`onBlocked`).
 * `play({ userGesture: true })` continua existindo para o gate repetir a tentativa
 * — é o clique real da repetição que rearma o probe.
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

/** O script da API não carregou. */
export const YT_ERROR_API_UNAVAILABLE = -1;

/** O player não ficou pronto em `READY_TIMEOUT_MS` (rede, ad-blocker, script). */
export const YT_ERROR_API_TIMEOUT = -2;

/** Depois disso a TV vira um aviso, não uma tela preta silenciosa. */
const READY_TIMEOUT_MS = 8000;

/**
 * Janela para pedir o gesto do usuário: a faixa carregou e não entrou em play
 * por isso. Curta de propósito — a TV é um bar, não um player de cinema, e o
 * usuário tocando resolve na hora. Ela SÓ existe enquanto a faixa ainda não
 * tocou nenhuma vez (ver `playedRef`).
 */
const BLOCKED_PROBE_MS = 1500;

/**
 * `useLayoutEffect` só pode rodar no cliente: o quiosque é SSR-rendered e o
 * React avisa no servidor. A ordem de cleanup que importa (destroy antes do
 * React mexer no DOM) só existe no cliente mesmo.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type YtPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  muteVideo(): void;
  unmuteVideo(): void;
  loadVideoById(videoId: string, startSeconds: number): void;
  getCurrentTime(): number;
  destroy(): void;
};

type YtEvents = {
  onReady?: (event: { target: YtPlayer }) => void;
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

    // Já existe script na página: o `onYouTubeIframeAPIReady` acima resolve a
    // promise quando a API terminar de subir. O componente tem timeout próprio
    // para o caso de a API nunca aparecer.
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
  /**
   * O player já está reproduzível? (só depois do `onReady` real do YouTube).
   * Quem manda no player pergunta isto em vez de guardar um "pronto" próprio:
   * assim um stage novo (fila esvaziou e voltou a ter música) nunca é confundido
   * com o player antigo.
   */
  isPlayable: () => boolean;
  /** Carrega um vídeo (reinicia do início ou de `startSeconds`). */
  load: (videoId: string, startSeconds?: number | null) => void;
  /**
   * Aplica play. `userGesture: true` só quando quem chama é o clique do
   * "toque para começar" — é o único caso em que vale rearmar o pedido de
   * gesto. O quiosque também chama `play()` a cada poll de 5s, e aí não é gesto
   * nenhum (foi exatamente isso que virou spam de CTA na TV).
   */
  play: (options?: { userGesture?: boolean }) => void;
  pause: () => void;
  stop: () => void;
  /**
   * Começa/continua mudo. É a última rede do gate: quando o browser recusa o
   * áudio mesmo dentro do toque (erro 150), a TV toca muda e o quiosque oferece
   * "Ativar o som" — o clique seguinte é um gesto novo, e é ele que destrava.
   */
  mute: () => void;
  unmute: () => void;
};

export type YouTubeStageProps = {
  className?: string;
  /**
   * Disparado quando o player está de fato reproduzível (o `onReady` real do
   * YouTube, com os métodos disponíveis). O quiosque só aplica o estado do banco
   * depois disso; antes, o estado fica pendente dentro do stage.
   */
  onReady?: () => void;
  onEnded?: (videoId: string) => void;
  /**
   * O vídeo entrou em `PLAYING` de verdade. É o sinal de que o CTA de "toque
   * para começar" pode sair: antes disso, o vídeo pode estar carregado e mudo.
   */
  onPlaying?: () => void;
  /** Autoplay recusado (erro 150) ou vídeo que não entrou em play. */
  onBlocked?: () => void;
  onError?: (code: number) => void;
};

/** O que o player deveria estar fazendo, independente de já estar pronto. */
type PlaybackIntent = {
  videoId: string;
  startSeconds: number | null;
  playback: "play" | "pause";
};

/** O que já foi pedido ao player de fato. */
type LoadedVideo = {
  videoId: string;
  startSeconds: number | null;
};

/**
 * A API só "tem" o método depois do ready. Checar a existência em vez de
 * envolver tudo em try/catch distingue os dois problemas: método ausente é o
 * player subindo (a TV espera), erro dentro do método é bug (o error boundary
 * do quiosque assume).
 */
function canCall<K extends keyof YtPlayer>(
  player: YtPlayer | null,
  method: K
): player is YtPlayer & Required<Pick<YtPlayer, K>> {
  return typeof player?.[method] === "function";
}

export const YouTubeStage = forwardRef<YouTubeStageHandle, YouTubeStageProps>(
  function YouTubeStage(
    { className, onReady, onEnded, onPlaying, onBlocked, onError },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YtPlayer | null>(null);
    const intentRef = useRef<PlaybackIntent | null>(null);
    const loadedRef = useRef<LoadedVideo | null>(null);
    const playProbeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reportedRef = useRef(false);
    /**
     * A faixa atual já entrou em play ao menos uma vez? Enquanto for `false`, um
     * `BUFFERING` ainda é a faixa subindo (e vale esperar o gesto); depois que
     * tocou, buffering é só reconexão de rede e NÃO pode gerar CTA.
     */
    const playedRef = useRef(false);
    const callbacks = useRef({ onReady, onEnded, onPlaying, onBlocked, onError });
    callbacks.current = { onReady, onEnded, onPlaying, onBlocked, onError };

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
      }, BLOCKED_PROBE_MS);
    }, [clearBlockedProbe]);

    const reportError = useCallback(
      (code: number) => {
        if (reportedRef.current) return;
        reportedRef.current = true;
        clearBlockedProbe();
        callbacks.current.onError?.(code);
      },
      [clearBlockedProbe]
    );

    /**
     * Aplica a intenção pendente **no player**; se ele ainda não estiver pronto,
     * a intenção fica guardada e será aplicada no `onReady`. Idempotente: chamar
     * de novo com a mesma intenção não recarrega a faixa (recarregar=zera o
     * vídeo na TV).
     */
    const applyIntent = useCallback(() => {
      const player = playerRef.current;
      if (!player) return;

      const intent = intentRef.current;
      if (!intent) {
        if (loadedRef.current) {
          if (canCall(player, "stopVideo")) player.stopVideo();
          loadedRef.current = null;
        }
        playedRef.current = false;
        clearBlockedProbe();
        return;
      }

      const startSeconds = intent.startSeconds ?? 0;
      const alreadyLoaded =
        loadedRef.current?.videoId === intent.videoId &&
        loadedRef.current.startSeconds === startSeconds;
      if (!alreadyLoaded) {
        if (!canCall(player, "loadVideoById")) {
          reportError(YT_ERROR_API_UNAVAILABLE);
          return;
        }
        playedRef.current = false;
        player.loadVideoById(intent.videoId, startSeconds);
        loadedRef.current = { videoId: intent.videoId, startSeconds };
        // O vídeo acabou de carregar e começa a tocar por conta própria
        // (playerVars.autoplay); se o navegador recusar, o probe abaixo
        // dispara o CTA de toque. É o ÚNICO `play()` implícito que arma o
        // probe: os `play()` do quiosque (poll de 5s) não são gesto nem carga.
        armBlockedProbe();
      }

      if (intent.playback === "play") {
        if (canCall(player, "playVideo")) {
          player.playVideo();
        } else {
          reportError(YT_ERROR_API_UNAVAILABLE);
        }
      } else if (canCall(player, "pauseVideo")) {
        player.pauseVideo();
        playedRef.current = true;
        clearBlockedProbe();
      } else {
        reportError(YT_ERROR_API_UNAVAILABLE);
      }
    }, [armBlockedProbe, clearBlockedProbe, reportError]);

    useImperativeHandle(
      ref,
      () => ({
        isPlayable: () => playerRef.current !== null,
        load(videoId: string, startSeconds?: number | null) {
          // A faixa nova entra tocando (playerVars.autoplay) e o quiosque logo
          // em seguida decide play/pause pelo estado da sala.
          intentRef.current = {
            videoId,
            startSeconds: startSeconds ?? 0,
            playback: "play",
          };
          applyIntent();
        },
        play(options?: { userGesture?: boolean }) {
          const intent = intentRef.current;
          if (!intent) return;
          intent.playback = "play";
          // Só o clique real do CTA rearma o pedido de gesto: aqui a TV já
          // esperou o probe uma vez e o navegador decide de novo.
          if (options?.userGesture && !playedRef.current) armBlockedProbe();
          applyIntent();
        },
        pause() {
          const intent = intentRef.current;
          if (intent) {
            intent.playback = "pause";
            applyIntent();
          }
        },
        stop() {
          intentRef.current = null;
          applyIntent();
        },
        mute() {
          // Não passa por `applyIntent`: mute não é intenção de reprodução, é
          // estado de áudio do player atual — e não pode virar re-load da faixa.
          if (canCall(playerRef.current, "muteVideo")) playerRef.current.muteVideo();
        },
        unmute() {
          if (canCall(playerRef.current, "unmuteVideo")) playerRef.current.unmuteVideo();
        },
      }),
      [applyIntent, armBlockedProbe]
    );

    useEffect(() => {
      let cancelled = false;

      // Rede lenta, ad-blocker ou script bloqueado: a TV precisa de uma tela de
      // erro, não de um retângulo preto com a faixa errada no rodapé.
      const readyTimer = setTimeout(() => {
        if (!cancelled && !playerRef.current) {
          reportError(YT_ERROR_API_TIMEOUT);
        }
      }, READY_TIMEOUT_MS);

      void loadYouTubeIframeApi()
        .then((YT) => {
          if (cancelled || !hostRef.current) return;
          new YT.Player(hostRef.current, {
            playerVars: {
              // `autoplay: 0` de propósito: quem manda no play é o toque do
              // `PlayerGate`. Com `autoplay: 1` o player tentaria sozinho logo
              // depois de montado e o `playVideo()` do quiosque competiria com
              // esse play fora da janela de ativação do gesto.
              autoplay: 0,
              controls: 1,
              rel: 0,
              fs: 0,
              playsinline: 1,
              iv_load_policy: 3,
              origin: window.location.origin,
            },
            events: {
              onReady: (event) => {
                if (cancelled) return;
                clearTimeout(readyTimer);
                // `event.target` é o handle documentado — e o único que já tem
                // os métodos. A instância do construtor ainda não tem.
                playerRef.current = event.target;
                reportedRef.current = false;
                callbacks.current.onReady?.();
                applyIntent();
              },
              onStateChange: (event) => {
                if (event.data === YT_STATE.PLAYING) {
                  // Tocou de verdade: o CTA de gesto tem que sair, senão ele
                  // fica por cima do vídeo que já está passando.
                  playedRef.current = true;
                  clearBlockedProbe();
                  callbacks.current.onPlaying?.();
                  return;
                }
                if (event.data === YT_STATE.CUED) {
                  // Carregou e NÃO começou: é a assinatura do autoplay bloqueado.
                  if (!playedRef.current) armBlockedProbe();
                  return;
                }
                if (event.data === YT_STATE.BUFFERING) {
                  // Só interessa antes da faixa tocar a primeira vez — depois
                  // disso é reconexão de rede e não pode virar CTA.
                  if (!playedRef.current) armBlockedProbe();
                  return;
                }
                if (event.data === YT_STATE.PAUSED) {
                  playedRef.current = true;
                  clearBlockedProbe();
                  return;
                }
                if (event.data === YT_STATE.ENDED) {
                  playedRef.current = false;
                  clearBlockedProbe();
                  const finished = loadedRef.current?.videoId;
                  loadedRef.current = null;
                  if (finished) callbacks.current.onEnded?.(finished);
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
        })
        .catch(() => {
          if (cancelled) return;
          clearTimeout(readyTimer);
          reportError(YT_ERROR_API_UNAVAILABLE);
        });

      return () => {
        cancelled = true;
        clearTimeout(readyTimer);
        clearBlockedProbe();
        intentRef.current = null;
        // NÃO destroi o player aqui: este cleanup é passivo e roda depois de o
        // React já ter removido o DOM (a IFrame API remove o iframe do pai e
        // isso estourava `NotFoundError`). A destruição é no cleanup de layout
        // abaixo.
      };
    }, [applyIntent, armBlockedProbe, clearBlockedProbe, reportError]);

    /**
     * Destruição em FASE DE LAYOUT (antes de o React mexer no DOM).
     *
     * `destroy()` da IFrame API tira o iframe do pai: se o React já tiver
     * desmontado o stage, o `removeChild` é sobre um nó órfão e o erro
     * derrubava a TV inteira. Dois gatilhos diferentes chegaram aqui — a
     * música acabando com a fila vazia e o host apertando "Parar" (nos dois,
     * `current` vira `null` e o `<YouTubeStage>` sai do DOM).
     *
     * O `try/catch` é a segunda rede: mesmo em ordem, o player pode ter sido
     * derrubado por outra via (navegador, script do YouTube) e um
     * `NotFoundError` no teardown não pode virar tela de erro na TV.
     */
    useIsomorphicLayoutEffect(() => {
      return () => {
        const player = playerRef.current;
        playerRef.current = null;
        // Nunca chegou a ficar pronto: não há player para destruir (e `destroy`
        // nem existe na instância parcial).
        if (!canCall(player, "destroy")) return;
        try {
          player.destroy();
        } catch {
          // Player já indo embora; a TV continua. Erro aqui é do YouTube, não
          // do estado da sala.
        }
      };
    }, []);

    return <div ref={hostRef} className={className} data-testid="youtube-stage" />;
  }
);
