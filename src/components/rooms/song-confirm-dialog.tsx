"use client";

import { LoaderCircle, Music4 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDurationSeconds } from "@/lib/youtube/format";
import type { YouTubeVideo } from "@/lib/youtube/types";

type SongConfirmDialogProps = {
  /** Música aguardando confirmação; `null` mantém o dialog fechado. */
  video: YouTubeVideo | null;
  busy?: boolean;
  onConfirm: (video: YouTubeVideo) => void;
  onCancel: () => void;
};

/**
 * Confirmação antes de mandar a música para a fila (Fase 5, Bloco B) —
 * ligado por `rooms.require_song_confirmation`, que até aqui era só um toggle
 * sem nenhum efeito no runtime. "Cancelar" não adiciona nada; "Confirmar" é o
 * único caminho que chama `addSongToQueueAction`.
 */
export function SongConfirmDialog({
  video,
  busy = false,
  onConfirm,
  onCancel,
}: SongConfirmDialogProps) {
  const duration = video ? formatDurationSeconds(video.durationSeconds) : null;

  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music4 className="size-4" />
            Adicionar esta música?
          </DialogTitle>
          <DialogDescription>
            Confira antes: a música vai entrar na fila da sala e todo mundo vê.
          </DialogDescription>
        </DialogHeader>

        {video && (
          <div className="flex items-center gap-3 rounded-xl border p-2">
            {video.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- host externo (YouTube), sem optimize
              <img
                src={video.thumbnailUrl}
                alt={`Miniatura de ${video.title}`}
                className="h-14 w-24 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="bg-muted flex h-14 w-24 shrink-0 items-center justify-center rounded-md">
                <Music4 className="text-muted-foreground size-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{video.title}</p>
              {duration && <p className="text-muted-foreground text-xs">{duration}</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => video && onConfirm(video)}
            disabled={busy || !video}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
