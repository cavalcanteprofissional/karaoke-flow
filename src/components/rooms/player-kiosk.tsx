"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Music4, Radio, Volume2 } from "lucide-react";

import { PlayerGate } from "@/components/rooms/player-gate";
import { RoomQr } from "@/components/rooms/room-qr";
import {
  YouTubeStage,
  YT_ERROR_AUTOPLAY_BLOCKED,
} from "@/components/rooms/youtube-stage";
import type { YouTubeStageHandle } from "@/components/rooms/youtube-stage";
import { Button } from "@/components/ui/button";
import { getPlayerStateAction, claimNextSongAction } from "@/lib/rooms/playback-actions";
import { setPlayerArmed, usePlayerArmed } from "@/lib/rooms/player-arm";
import { subscribeToPlaybackChanges } from "@/lib/rooms/player-channel";
import {
  playerHeadline,
  playerPanel,
  shouldAutoAdvance,
  shouldClaimFromIdle,
  shouldShowPlayerGate,
} from "@/lib/rooms/playback";
import type { PlayerState } from "@/lib/rooms/playback";
import { roomJoinUrl } from "@/lib/rooms/utils";
import { useClientOrigin } from "@/lib/use-client-origin";
import { formatDurationSeconds } from "@/lib/youtube/format";

/**
 * Tela do player (Fase 6/8a) — a TV do bar, aberta em modo quiosque, pode
 * entrar de duas formas: SEM sessão e com o `token` na URL
 * (`/player/<codigo>?token=...`, a TV), ou COM a sessão de um participante
 * aprovado / do dono (`token = null`). Quem manda é o banco: o quiosque nunca
 * decide o que toca, ele pergunta (`get_player_state`), toca o que vier, e
 * pede a próxima quando a sala está ociosa com fila aprovada
 * (`claim_next_song`, sob advisory lock). O poll de 5s é a rede de segurança
 * para a TV ficar de pé por horas; o canal realtime do host é o caminho rápido.
 *
 * ── O toque de partida (Fase 8) ──────────────────────────────────────────────
 * A TV só toca depois de um toque humano, e esse toque é o `PlayerGate`: tela
 * inteira que aparece ANTES do player do YouTube existir. Duas consequências que
 * valem mais que "destravar o áudio":
 *
 *   - o player é montado dentro do gesto, e o primeiro `play()` dele cai na
 *     janela de ativação do browser. Era o que faltava: o player subia no mount
 *     e o `playVideo()` do quiosque chegava fora do gesto, o browser recusava
 *     (erro 150) e a TV ficava muda até alguém clicar no CTA;
 *   - desarmada, a TV não pede a próxima música (`shouldClaimFromIdle`), não
 *     baixa vídeo nenhum e não existe overlay por cima do vídeo.
 *
 * O "armado" fica no `localStorage` por sala (`src/lib/rooms/player-arm.ts`): a TV
 * pede o toque uma vez, não a cada música, e o botão "travar" da faixa
 * inferior é quem limpa a marcação (voltando ao gate). Ele é store externo, e
 * não estado do React, porque o quiosque é SSR-rendered — ler o storage no
 * primeiro render fazia o servidor mandar o gate e o cliente mandar o vídeo, e a
 * tela hydratava com duas árvores diferentes. Quem navega é o D-pad do
 * controle, então o botão do gate é um `<button>` nativo com foco automático —
 * Enter/OK nele dispara.
 */
const POLL_MS = 5000;

/**
 * Depois de "Começar sem som", quanto tempo o botão "Ativar o som" fica na faixa
 * inferior. O destravamento depende do `unmute` ser aceito pelo browser; o
 * timeout existe para o botão não ficar piscando a noite inteira numa TV onde
 * ninguém mais vai tocar.
 */
const AUDIO_UNLOCK_TIMEOUT_MS = 15000;

export type PlayerKioskProps = {
  roomCode: string;
  /** `null` = player por sessão (participante aprovado / host). A TV traz o token. */
  token: string | null;
  initialState: PlayerState;
  onInvalid?: (error: string) => void;
};

export function PlayerKiosk({
  roomCode,
  token,
  initialState,
  onInvalid,
}: PlayerKioskProps) {
  const [state, setState] = useState<PlayerState>(initialState);
  /**
   * O toque de partida já aconteceu nesta TV? Enquanto for `false` o player do
   * YouTube não existe e a fila não anda (ver `PlayerGate` no topo do arquivo).
   *
   * Vem do `localStorage` por store externo (`usePlayerArmed`), e não de
   * `useState`: o quiosque é SSR-rendered, e o primeiro render do cliente
   * precisa ser idêntico ao HTML do servidor.
   */
  const armed = usePlayerArmed(roomCode);
  /**
   * A TV é a tela que tem o `token` (`/player/<código>?token=…`); o convidado
   * que abre `/player/<código>` pela sessão entra no MESMO componente com
   * `token = null`. A diferença não é de permissão — as duas podem ver a fila e
   * o que está tocando — e sim de QUEM MANDA: só a TV puxa a próxima faixa.
   *
   * Daí saem as três diferenças do modo visualizador: sem gate de toque (não há
   * áudio a destravar no celular), `canAdvance` falso nas duas perguntas puras
   * acima, e o "Trancar TV" escondido. `claimNext` também recusa na entrada, mas
   * isso é defense in depth: a regra de verdade é a da migration, que exige o
   * token.
   */
  const isTv = token !== null;
  /** Sem token não há áudio local: nasce mudo e não há botão de destravar. */
  const viewerSilent = !isTv;
  /**
   * Quem só assiste não depende do "armado" da TV: o `localStorage` é por
   * origem, e o celular do convidado nunca foi armado — sem esta conta, ele cairia
   * na tela de "Escaneie para adicionar" enquanto a TV toca, que é o oposto de
   * ver a festa. Para o visualizador, o player existe sempre que há faixa, e
   * silencioso (o áudio é da TV): o `muteOnLoadRef` nasce verdadeiro, e o
   * "Trancar TV" nem aparece.
   */
  const effectiveArmed = isTv ? armed : true;
  /**
   * O player recebeu `play` e a faixa NÃO começou (erro 150 / gesto recusado):
   * é a fase "tentar de novo" do gate, que aparece mesmo com a TV armada e mesmo
   * com a fila vazia — sem ela, o vídeo ficaria preso no primeiro frame e a TV
   * sem nenhum botão. Zera quando a faixa toca e quando vira outra faixa.
   */
  const [stalled, setStalled] = useState(false);
  /** A TV entrou mudo de propósito: a faixa inferior oferece "Ativar o som". */
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  // O player do YouTube nasce assíncrono: o estado do banco só pode ser aplicado
  // (load/play) depois que o player estiver reproduzível, senão a primeira
  // música da sessão nunca carrega. Este contador NÃO é a verdade sobre o player
  // — ele só existe para reexecutar o efeito de aplicação a cada `onReady` (um
  // por montagem do stage). Quem sabe se dá para tocar é o próprio stage, em
  // `stageRef.current.isPlayable()`.
  const [playerGeneration, setPlayerGeneration] = useState(0);
  /**
   * Base do QR codificado pela TV: o host que a TV está vendo, não a da env.
   * `NEXT_PUBLIC_APP_URL` é inlinada no bundle em build time — num deploy de
   * preview da Vercel ela aponta para a produção e o QR manda o visitante para o
   * app errado. `null` até o effect, aí a env segura o primeiro render.
   */
  const clientOrigin = useClientOrigin();
  const stageRef = useRef<YouTubeStageHandle>(null);
  const stateRef = useRef(state);
  const loadedRef = useRef<string | null>(null);
  const claimingRef = useRef(false);
  /** O gate mandou começar mudo: o stage aplica assim que a faixa carregar. */
  const muteOnLoadRef = useRef(viewerSilent);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // O estado mais recente para os callbacks imperativos (onEnded chega do
  // player, fora do ciclo de render): mantém o callback estável sem ler
  // props stale.
  const current = state.current;
  const playbackStatus = state.room.playback_status;

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    const result = await getPlayerStateAction(roomCode, token);
    if (!result.ok) {
      onInvalid?.(result.error);
      return;
    }
    setState(result.state);
    stateRef.current = result.state;
  }, [roomCode, token, onInvalid]);

  const claimNext = useCallback(
    async (finishedItemId?: string | null) => {
      // Quem só assiste não avança a fila: a TV é quem tem o token e quem
      // termina a faixa no banco. As regras puras já respondem `false`, mas a
      // guarda aqui fecha o caminho mesmo se um `claim` entrar por outro effect.
      if (!isTv) return;
      if (claimingRef.current) return;
      claimingRef.current = true;
      try {
        const result = await claimNextSongAction(roomCode, token, finishedItemId ?? null);
        if (!result.ok) {
          onInvalid?.(result.error);
          return;
        }
        await refresh();
      } finally {
        claimingRef.current = false;
      }
    },
    [roomCode, token, isTv, refresh, onInvalid]
  );

  // Poll: mantém a TV coerente mesmo sem realtime (reconexão, troca de rede).
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Caminho rápido: o host avisa por broadcast depois de gravar no banco.
  useEffect(
    () => subscribeToPlaybackChanges(roomCode, () => void refresh()),
    [roomCode, refresh]
  );

  // O estado do banco manda no player: troca de música recarrega, pausar
  // segura, e nada de recarregar a mesma faixa (recarregar=zera o vídeo).
  useEffect(() => {
    const item = current;
    const stage = stageRef.current;
    if (!effectiveArmed) {
      // Desarmada não é "sala ociosa": o player simplesmente não existe, e o
      // `loadedRef` é zerado porque quem guardava a faixa foi destruído junto
      // com o stage. Sem esse zero, ao rearmar a mesma faixa pareceria "já
      // carregada" e a TV ficaria muda mesmo com o gesto certo.
      loadedRef.current = null;
      return;
    }
    if (!item) {
      // A fila esvaziou e o stage desmontou: a próxima música monta um player
      // novo, que ainda não está reproduzível. `loadedRef` zera aqui; a
      // readiness não precisa (e não pode) ser zerada por setState dentro do
      // efeito — quem responde é `stage.isPlayable()` do stage que está na tela.
      loadedRef.current = null;
      stage?.stop();
      return;
    }
    // Sem player reproduzível ainda não dá para carregar nada — o stage guarda a
    // intenção e aplica no `onReady`. Marcar como "carregado" aqui perderia a
    // primeira música da sessão.
    if (!stage?.isPlayable()) return;
    if (loadedRef.current !== item.youtube_video_id) {
      loadedRef.current = item.youtube_video_id;
      // Faixa nova: o travamento anterior era desta outra música, e a música
      // antiga já foi desfeita pelo auto-avanço. A tela pode fechar o gate.
      setStalled(false);
      // O "começar sem som" precisa valer já no primeiro play — depois do
      // `load` o gesto já passou e não dá para pedir mute retroativo.
      if (muteOnLoadRef.current) stage.mute();
      stage.load(item.youtube_video_id, item.elapsed_seconds ?? 0);
    }
    if (playbackStatus === "paused") {
      stage.pause();
    } else {
      stage.play();
    }
  }, [effectiveArmed, current, playbackStatus, playerGeneration]);

  // Claim por motivo de ESTADO, não de vídeo: sempre que o quiosque relê o
  // banco (boot, poll de 5s, broadcast do host) e encontra a sala ociosa com
  // música aprovada, pede a próxima. Antes isso só_existia no mount, então
  // aprovar uma música com a TV já aberta não iniciava nada — a TV ficava no
  // "Escaneie para adicionar" e o claim só voltaria a existir no fim de uma
  // faixa (ou nunca, se não havia nenhuma tocando).
  useEffect(() => {
    if (
      shouldClaimFromIdle({
        playbackStatus: state.room.playback_status,
        currentItemId: state.current?.id ?? null,
        queueLength: state.queue.length,
        armed,
        canAdvance: isTv,
      })
    ) {
      void claimNext();
    }
  }, [state, armed, isTv, claimNext]);

  const handleEnded = useCallback(
    (videoId: string) => {
      void (async () => {
        const snapshot = stateRef.current;
        const advance = shouldAutoAdvance({
          playbackStatus: snapshot.room.playback_status,
          currentVideoId: snapshot.current?.youtube_video_id ?? null,
          endedVideoId: videoId,
          queueLength: snapshot.queue.length,
          // `armed` direto (e não de um ref): o `onEnded` chega do player, mas o
          // `YouTubeStage` guarda os callbacks num ref, então a identidade deste
          // callback não provoca remontagem nem re-run de efeito.
          armed,
          canAdvance: isTv,
        });
        if (advance) {
          // O id viaja junto: o banco só terminaliza se ainda for o item atual
          // (claim repetido é no-op). Vem do snapshot, não do render: o
          // callback é estável e o `current` do render estaria velho.
          await claimNext(snapshot.current?.id ?? null);
        } else {
          await refresh();
        }
      })();
    },
    [claimNext, refresh, armed, isTv]
  );

  /**
   * O stage avisou que a faixa carregou e não entrou em play (probe) ou que o
   * YouTube recusou o áudio (erro 150). O quiosque não desenha nada sobre o
   * vídeo: ele vira a tela de gate, que é a mesma do toque de partida, agora na
   * fase "de novo".
   */
  const handleBlocked = useCallback(() => {
    setStalled(true);
  }, []);

  const handlePlaying = useCallback(() => {
    // Tocou de verdade: o gate fecha, e o "armado" continua valendo no
    // `localStorage` (quem tranca a TV é o botão "travar", não o fim da faixa).
    setStalled(false);
  }, []);

  /** Fase 1: o toque que arma a TV. O stage nasce DENTRO deste gesto. */
  const handleArm = useCallback(() => {
    setStalled(false);
    setPlayerError(false);
    setPlayerArmed(roomCode, true);
  }, [roomCode]);

  /**
   * Fase 2: repetir a tentativa com o gesto real. Se o player ainda não subiu
   * (a fila esvaziou no meio da tentativa, o que desmonta o stage), refaz o
   * claim em vez de chamar `play` num player morto.
   */
  const handleRetry = useCallback(() => {
    setStalled(false);
    const stage = stageRef.current;
    if (stage?.isPlayable()) {
      stage.play({ userGesture: true });
      return;
    }
    void claimNext();
  }, [claimNext]);

  /**
   * Última rede: entra mudo. O vídeo aparece — que é o que importa para o
   * grupo — e o quiosque passa a oferecer "Ativar o som" na faixa inferior:
   * aquele clique é um gesto novo, inteiro, e é ele que o browser aceita.
   */
  const handleStartMuted = useCallback(() => {
    setStalled(false);
    setPlayerArmed(roomCode, true);
    muteOnLoadRef.current = true;
    stageRef.current?.mute();
    setNeedsUnmute(true);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      unlockTimerRef.current = null;
      setNeedsUnmute(false);
    }, AUDIO_UNLOCK_TIMEOUT_MS);
  }, [roomCode]);

  const handleUnlockAudio = useCallback(() => {
    muteOnLoadRef.current = false;
    setNeedsUnmute(false);
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    stageRef.current?.unmute();
  }, []);

  /** Trancar a TV: some com o vídeo e devolve a tela de gate. */
  const handleLock = useCallback(() => {
    setStalled(false);
    setNeedsUnmute(false);
    muteOnLoadRef.current = false;
    loadedRef.current = null;
    setPlayerArmed(roomCode, false);
  }, [roomCode]);

  const panel = playerPanel(state);
  const headline = playerHeadline(state);
  const gateDue =
    isTv &&
    shouldShowPlayerGate({
      armed,
      currentItemId: current?.id ?? null,
      queueLength: state.queue.length,
      stalled,
    });
  // Desarmada com fila vazia não é gate: é a tela de "Escaneie para adicionar",
  // que é o que o convidado vê antes de existir música. O gate assume no mesmo
  // instante em que o host aprova a primeira.
  const showPlayer = Boolean(current) && effectiveArmed;
  const showIdle = !current && !gateDue;

  return (
    <div className="flex h-dvh flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1">
        {showPlayer && (
          <YouTubeStage
            ref={stageRef}
            className="size-full"
            onReady={() => {
              // Contador, não booleano: cada montagem do stage avisa uma vez, e
              // um stage novo precisa reexecutar o efeito mesmo que o anterior
              // já tivesse avisado.
              setPlayerGeneration((generation) => generation + 1);
              // Boot lento dá timeout; se o player ficou pronto depois, o aviso
              // some.
              setPlayerError(false);
            }}
            onEnded={handleEnded}
            onPlaying={handlePlaying}
            onBlocked={handleBlocked}
            onError={(code) => {
              // O 150 é autoplay recusado: vira gate, não tela de erro — o
              // player continua montado e o vídeo pode estar no ar mudo.
              if (code === YT_ERROR_AUTOPLAY_BLOCKED) {
                setStalled(true);
                return;
              }
              setPlayerError(true);
            }}
          />
        )}

        {showIdle && (
          <div className="flex size-full flex-col items-center justify-center gap-6 p-8">
            {panel.empty ? (
              <>
                <RoomQr
                  value={roomJoinUrl(state.room.code, clientOrigin)}
                  alt={`QR para adicionar músicas na sala ${state.room.code}`}
                  fallbackLabel={state.room.code}
                  size={320}
                  showDownload={false}
                />
                <p className="text-center text-2xl font-semibold">
                  Escaneie para adicionar uma música
                </p>
              </>
            ) : (
              <p className="text-center text-2xl font-semibold">{headline}</p>
            )}
          </div>
        )}

        {gateDue && !playerError && (
          <PlayerGate
            roomCode={roomCode}
            state={state}
            phase={stalled ? 2 : 1}
            onStart={handleArm}
            onRetry={handleRetry}
            onUnlockAudio={handleStartMuted}
          />
        )}

        {playerError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-8 text-center">
            <p className="text-2xl font-semibold">
              Não foi possível tocar esta música. Pule pelo controle do dono da sala.
            </p>
          </div>
        )}
      </div>

      <aside className="shrink-0 border-t border-white/10 bg-zinc-950 px-6 py-4">
        <div className="flex items-center gap-3">
          <Radio className="size-5 text-emerald-400" />
          <p className="text-lg font-semibold">
            {headline}
            {state.current ? ` — ${state.current.title}` : ""}
          </p>
          {panel.pendingCount > 0 && (
            <span className="text-sm text-zinc-400">
              {panel.pendingCount} aguardando aprovação
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            {needsUnmute && isTv && (
              <Button
                size="lg"
                variant="secondary"
                className="h-14 text-lg"
                onClick={handleUnlockAudio}
              >
                <Volume2 className="size-5" />
                Ativar o som
              </Button>
            )}
            {showPlayer && isTv && (
              <Button
                size="lg"
                variant="ghost"
                className="h-14 text-lg"
                onClick={handleLock}
              >
                <Lock className="size-5" />
                Trancar TV
              </Button>
            )}
          </div>
        </div>

        {panel.rows.length > 0 && (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {panel.rows.map((row) => {
              const duration = formatDurationSeconds(row.item.duration_seconds);
              return (
                <li
                  key={row.item.id}
                  className={
                    row.highlight === "now"
                      ? "rounded-lg bg-emerald-500/20 px-3 py-2 text-lg font-bold"
                      : row.highlight === "next"
                        ? "rounded-lg border-2 border-amber-400 px-3 py-2 text-lg font-bold"
                        : "px-3 py-2 text-base text-zinc-300"
                  }
                >
                  <span className="text-zinc-400">#{row.item.position}</span>{" "}
                  {row.item.title}
                  <span className="ml-2 text-sm font-normal text-zinc-400">
                    {duration ? `${duration} · ` : ""}
                    {row.item.requested_by
                      ? `pedido por ${row.item.requested_by}`
                      : "pedido na sala"}
                  </span>
                  {row.highlight === "next" && (
                    <span className="ml-2 text-sm font-normal text-amber-300">
                      em seguida
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {panel.empty && (
          <p className="mt-3 flex items-center gap-2 text-base text-zinc-400">
            <Music4 className="size-4" />A fila está vazia — a tela volta a tocar assim
            que alguém pedir.
          </p>
        )}
      </aside>
    </div>
  );
}
