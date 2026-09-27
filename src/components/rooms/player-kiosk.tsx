"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Music4, Play, Radio } from "lucide-react";

import { RoomQr } from "@/components/rooms/room-qr";
import { YouTubeStage } from "@/components/rooms/youtube-stage";
import type { YouTubeStageHandle } from "@/components/rooms/youtube-stage";
import { Button } from "@/components/ui/button";
import { getPlayerStateAction, claimNextSongAction } from "@/lib/rooms/playback-actions";
import { subscribeToPlaybackChanges } from "@/lib/rooms/player-channel";
import {
  playerHeadline,
  playerPanel,
  shouldAutoAdvance,
  shouldClaimFromIdle,
} from "@/lib/rooms/playback";
import type { PlayerState } from "@/lib/rooms/playback";
import { roomJoinUrl } from "@/lib/rooms/utils";
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
 */
const POLL_MS = 5000;

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
  const [needsGesture, setNeedsGesture] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  // O player do YouTube nasce assíncrono: o estado do banco só pode ser aplicado
  // (load/play) depois que o player estiver reproduzível, senão a primeira
  // música da sessão nunca carrega. Este contador NÃO é a verdade sobre o player
  // — ele só existe para reexecutar o efeito de aplicação a cada `onReady` (um
  // por montagem do stage). Quem sabe se dá para tocar é o próprio stage, em
  // `stageRef.current.isPlayable()`.
  const [playerGeneration, setPlayerGeneration] = useState(0);
  const stageRef = useRef<YouTubeStageHandle>(null);
  const stateRef = useRef(state);
  const loadedRef = useRef<string | null>(null);
  const claimingRef = useRef(false);
  // O estado mais recente para os callbacks imperativos (onEnded chega do
  // player, fora do ciclo de render): mantém o callback estável sem ler
  // props stale.
  const current = state.current;
  const playbackStatus = state.room.playback_status;

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
    [roomCode, token, refresh, onInvalid]
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
      stage.load(item.youtube_video_id, item.elapsed_seconds ?? 0);
    }
    if (playbackStatus === "paused") {
      stage.pause();
    } else {
      stage.play();
    }
  }, [current, playbackStatus, playerGeneration]);

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
      })
    ) {
      void claimNext();
    }
  }, [state, claimNext]);

  const handleEnded = useCallback(
    (videoId: string) => {
      void (async () => {
        const snapshot = stateRef.current;
        const advance = shouldAutoAdvance({
          playbackStatus: snapshot.room.playback_status,
          currentVideoId: snapshot.current?.youtube_video_id ?? null,
          endedVideoId: videoId,
          queueLength: snapshot.queue.length,
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
    [claimNext, refresh]
  );

  const handleBlocked = useCallback(() => {
    setNeedsGesture(true);
  }, []);

  // O CTA só sai com o vídeo tocando: até lá, quem chega é o erro 150 ou o
  // probe de autoplay bloqueado do stage.
  const handlePlaying = useCallback(() => {
    setNeedsGesture(false);
  }, []);

  const startWithGesture = useCallback(() => {
    setNeedsGesture(false);
    // `userGesture` é o que distingue este play dos `play()` do poll de 5s —
    // é o único lugar onde o stage pode rearmar o pedido de gesto.
    stageRef.current?.play({ userGesture: true });
  }, []);

  const panel = playerPanel(state);
  const headline = playerHeadline(state);

  return (
    <div className="flex h-dvh flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1">
        {state.current ? (
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
            onError={() => setPlayerError(true)}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-6 p-8">
            {panel.empty ? (
              <>
                <RoomQr
                  value={roomJoinUrl(state.room.code)}
                  alt={`QR para adicionar músicas na sala ${state.room.code}`}
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

        {needsGesture && !playerError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-8">
            <Button
              size="lg"
              className="h-20 rounded-2xl px-10 text-2xl"
              onClick={startWithGesture}
            >
              <Play className="size-8" />
              Toque para começar
            </Button>
          </div>
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
