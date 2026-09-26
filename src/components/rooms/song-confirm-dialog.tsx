"use client";

import { LoaderCircle, Music4, Repeat2 } from "lucide-react";

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
  /**
   * Bloco D: no modo troca o texto muda e o botão promete o que a RPC faz —
   * manter a posição e a aprovação (D2).
   */
  mode?: "add" | "replace";
  /** Música que está sendo trocada, para o texto do dialogo. */
  replaceItemTitle?: string | null;
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
  mode = "add",
  replaceItemTitle,
  onConfirm,
  onCancel,
}: SongConfirmDialogProps) {
  const duration = video ? formatDurationSeconds(video.durationSeconds) : null;
  const isReplace = mode === "replace";

  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReplace ? <Repeat2 className="size-4" /> : <Music4 className="size-4" />}
            {isReplace ? "Trocar a música da fila?" : "Adicionar esta música?"}
          </DialogTitle>
          <DialogDescription>
            {isReplace ? (
              <>
                {replaceItemTitle ? (
                  <>
                    <span className="text-foreground font-medium">
                      {replaceItemTitle}
                    </span>{" "}
                    será substituída por esta. A posição na fila e a{" "}
                    {`aprovação são mantidas — a troca não volta para a fila de aprovação.`}
                  </>
                ) : (
                  <>
                    A música escolhida substituirá a atual. A posição na fila e a
                    aprovação são mantidas.
                  </>
                )}
              </>
            ) : (
              "Confira antes: a música vai entrar na fila da sala e todo mundo vê."
            )}
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
            {isReplace ? "Trocar" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
