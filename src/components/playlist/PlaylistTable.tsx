"use client";

import Image from "next/image";
import { Play, Trash2, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PlaylistItem } from "@/lib/supabase/types";

interface PlaylistTableProps {
  playlist: PlaylistItem[];
  currentSongId: string | null;
  onPlay: (songId: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  isAdmin?: boolean;
  isLoading?: boolean;
}

export function PlaylistTable({
  playlist,
  currentSongId,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
  isAdmin = false,
  isLoading = false,
}: PlaylistTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando playlist...</span>
      </div>
    );
  }

  if (playlist.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground mb-2">Playlist vazia</p>
        <p className="text-sm text-muted-foreground">
          Solicite músicas para adicionar à playlist
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="text-left p-3 text-sm font-medium">#</th>
            <th className="text-left p-3 text-sm font-medium">Música</th>
            <th className="text-left p-3 text-sm font-medium hidden md:table-cell">Solicitante</th>
            {isAdmin && <th className="text-right p-3 text-sm font-medium">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {playlist.map((item, index) => {
            const song = item.songs;
            const isPlaying = item.song_id === currentSongId;

            return (
              <tr
                key={item.id}
                className={`border-t hover:bg-muted/50 ${
                  isPlaying ? "bg-primary/5" : ""
                }`}
              >
                <td className="p-3 text-sm text-muted-foreground w-12">
                  {isPlaying ? (
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-4 bg-primary animate-pulse" />
                      <div className="w-1 h-3 bg-primary animate-pulse delay-75" />
                      <div className="w-1 h-5 bg-primary animate-pulse delay-150" />
                    </div>
                  ) : (
                    index + 1
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                      {song?.thumbnail ? (
                        <Image
                          src={song.thumbnail}
                          alt={song.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <Play className="h-4 w-4 m-auto text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-medium text-sm truncate ${isPlaying ? "text-primary" : ""}`}>
                        {song?.title || "Música não disponível"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate hidden sm:block">
                        {song?.profiles?.full_name || "Desconhecido"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">
                  {song?.profiles?.full_name || "-"}
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onMoveUp(index)}
                          disabled={index === 0}
                          className="h-8 w-8"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onMoveDown(index)}
                          disabled={index === playlist.length - 1}
                          className="h-8 w-8"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemove(item.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onPlay(item.song_id)}
                      className="h-8 w-8"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
