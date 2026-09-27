"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  LoaderCircle,
  MapPin,
  Music2,
  Plus,
  Repeat2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SongConfirmDialog } from "@/components/rooms/song-confirm-dialog";
import { captureGeolocation, writeGeoCookie } from "@/lib/consent/geo";
import { addSongToQueueAction, replaceQueueSongAction } from "@/lib/rooms/queue-actions";
import { announceQueueChange } from "@/lib/rooms/room-channel";
import type { YouTubeVideo } from "@/lib/youtube/types";
import { formatDurationSeconds } from "@/lib/youtube/format";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: YouTubeVideo[] }
  | { kind: "error"; message: string; code?: string; geoRequired?: boolean };

type SongSearchProps = {
  roomCode: string;
  presenceOk: boolean;
  presenceMessage: string | null;
  /** `rooms.require_song_confirmation`: abre o modal antes de adicionar (Bloco B). */
  requireSongConfirmation: boolean;
  /**
   * Bloco D: id do item da fila que está sendo trocado. search vira troca — a
   * confirmação é obrigatória mesmo com `require_song_confirmation` desligado,
   * porque aqui a ação é sobrescrever o pedido de outra pessoa.
   */
  replaceItemId?: string;
  /** Título do item trocado, só para o texto do modal. */
  replaceItemTitle?: string | null;
};

const DEBOUNCE_MS = 500;

export function SongSearch({
  roomCode,
  presenceOk,
  presenceMessage,
  requireSongConfirmation,
  replaceItemId,
  replaceItemTitle,
}: SongSearchProps) {
  const isReplace = Boolean(replaceItemId);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<YouTubeVideo | null>(null);
  const [granting, setGranting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const canSearch = presenceOk;

  useEffect(() => {
    if (!canSearch) return;
    const trimmed = query.trim();
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/youtube/search?room=${encodeURIComponent(roomCode)}&q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } }
        );
        const body = (await response.json()) as {
          results?: YouTubeVideo[];
          error?: string;
          code?: string;
          geoRequired?: boolean;
        };
        if (!controller.signal.aborted) {
          if (!response.ok) {
            setState({
              kind: "error",
              message: body.error ?? "Não foi possível buscar agora.",
              code: body.code,
              geoRequired: body.geoRequired,
            });
          } else {
            setState({ kind: "results", results: body.results ?? [] });
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ kind: "error", message: "Falha de rede ao buscar músicas." });
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, roomCode, canSearch]);

  async function handleGrantLocation() {
    setGranting(true);
    const geo = await captureGeolocation();
    if (geo.status === "denied") {
      toast.error(
        "Permissão de localização negada. Habilite no navegador para pedir músicas."
      );
    } else if (geo.status === "unavailable") {
      toast.error("Não foi possível obter sua localização neste dispositivo.");
    } else {
      writeGeoCookie(geo);
      window.location.reload();
      return;
    }
    setGranting(false);
  }

  function handleAdd(video: YouTubeVideo) {
    if (adding) return;
    if (!isReplace && added.has(video.videoId)) return;
    if (requireSongConfirmation || isReplace) {
      setConfirming(video);
      return;
    }
    void addToQueue(video);
  }

  async function addToQueue(video: YouTubeVideo) {
    setAdding(video.videoId);
    if (replaceItemId) {
      const result = await replaceQueueSongAction(replaceItemId, video);
      setAdding(null);
      setConfirming(null);
      if (result.ok) {
        // A troca muda título/duração do item que TODO mundo vê na lista: os
        // aparelhos da sala precisam reler (o poll de 10s cobre quem não ouvir).
        void announceQueueChange(roomCode);
        toast.success(`${video.title} — música trocada, posição e status mantidos.`);
        return;
      }
      toast.error(result.error ?? "Não foi possível trocar a música.");
      return;
    }

    const result = await addSongToQueueAction({ roomCode, video });
    setAdding(null);
    setConfirming(null);
    if (result.ok) {
      setAdded((prev) => new Set(prev).add(video.videoId));
      // A sala precisa ver o pedido chegar na hora — em especial o host, que é
      // quem aprova, e os outros participantes, que era o que não acontecia.
      void announceQueueChange(roomCode);
      const label =
        result.item.status === "pending" ? "aguardando aprovação do host" : "na fila";
      toast.success(`${video.title} — ${label}`);
      // Pediu a música: a watch party é o destino. O player abre pela SESSÃO
      // (`/player/<código>` sem token), então o participante nunca vê o token
      // da TV; se a música foi para `pending`, a tela mostra o contador de
      // aguardando aprovação e o quiosque puxa sozinha quando o host aprovar.
      // TODO(Bloco 2/E): o destino passa a ser a tela da mesa
      // (`/salas/<código>`), com fila realtime, status da minha música e as
      // métricas — não a tela do player.
      router.push(`/player/${roomCode}`);
    } else {
      if (result.geoRequired) {
        toast.error(result.error);
        window.location.reload();
        return;
      }
      toast.error(result.error ?? "Não foi possível adicionar a música.");
    }
  }

  function placesLabel() {
    if (!query.trim()) {
      return (
        <p className="text-muted-foreground text-sm">
          Digite o nome da música (ou artista) para buscar no YouTube.
        </p>
      );
    }
    switch (state.kind) {
      case "loading":
        return (
          <span className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" />
            buscando no YouTube…
          </span>
        );
      case "results":
        if (state.results.length === 0) {
          return (
            <p className="text-muted-foreground text-sm">
              Nada encontrado. Tente outra busca.
            </p>
          );
        }
        return (
          <ul className="flex flex-col gap-2">
            {state.results.map((video) => {
              const duration = formatDurationSeconds(video.durationSeconds);
              const isAdded = !isReplace && added.has(video.videoId);
              return (
                <li
                  key={video.videoId}
                  className="border-border bg-background flex items-center gap-3 rounded-xl border p-2"
                >
                  <div className="relative shrink-0">
                    {video.thumbnailUrl ? (
                      <div
                        className="bg-muted relative aspect-video w-[120px] rounded-lg"
                        style={{
                          backgroundImage: `url(${video.thumbnailUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                        aria-hidden
                      />
                    ) : (
                      <div className="bg-muted flex aspect-video w-[120px] items-center justify-center rounded-lg">
                        <Music2 className="text-muted-foreground size-5" />
                      </div>
                    )}
                    {duration && (
                      <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-xs font-medium text-white">
                        {duration}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{video.title}</p>
                    {video.channelTitle && (
                      <p className="text-muted-foreground truncate text-xs">
                        {video.channelTitle}
                      </p>
                    )}
                  </div>
                  {isAdded ? (
                    <Badge variant="secondary">na fila</Badge>
                  ) : (
                    <Button
                      size="icon"
                      onClick={() => handleAdd(video)}
                      disabled={adding === video.videoId}
                      aria-label={
                        isReplace
                          ? `Trocar por ${video.title}`
                          : `Adicionar ${video.title} à fila`
                      }
                      title={isReplace ? "Trocar por esta música" : "Adicionar à fila"}
                    >
                      {adding === video.videoId ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : isReplace ? (
                        <Repeat2 className="size-4" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        );
      case "error":
        return (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              {state.message}
              {state.code === "RATE_LIMITED" && " (aguarde um pouco)"}
            </p>
            {state.geoRequired && (
              <Button size="sm" onClick={handleGrantLocation} disabled={granting}>
                {granting ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <MapPin className="size-3.5" />
                )}
                Permitir localização
              </Button>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!presenceOk && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-950/10 p-3 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div className="flex flex-col gap-2">
            <p>
              {presenceMessage ??
                "Precisamos da sua localização para confirmar que você está no bar."}
            </p>
            <div>
              <Button size="sm" onClick={handleGrantLocation} disabled={granting}>
                {granting ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <MapPin className="size-3.5" />
                )}
                Permitir localização
              </Button>
            </div>
          </div>
        </div>
      )}

      {isReplace && (
        <div className="flex flex-col gap-2">
          <Button asChild size="sm" variant="ghost" className="w-fit">
            <Link href={`/salas/${roomCode}`}>
              <ArrowLeft className="size-4" />
              Voltar para a fila
            </Link>
          </Button>
          <p className="text-muted-foreground text-sm">
            Trocando a música{" "}
            <span className="text-foreground font-medium">
              {replaceItemTitle ?? "da fila"}
            </span>
            . A posição e a aprovação são mantidas.
          </p>
        </div>
      )}

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          disabled={canSearch === false}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            isReplace
              ? "Buscar a música que vai substituir…"
              : "Buscar música no YouTube…"
          }
          className="h-12 rounded-xl pr-9 pl-9 text-base"
          aria-label="Buscar música no YouTube"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
            aria-label="Limpar busca"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {placesLabel()}

      <SongConfirmDialog
        video={confirming}
        busy={adding === confirming?.videoId}
        mode={isReplace ? "replace" : "add"}
        replaceItemTitle={replaceItemTitle ?? null}
        onCancel={() => setConfirming(null)}
        onConfirm={(video) => void addToQueue(video)}
      />
    </div>
  );
}
