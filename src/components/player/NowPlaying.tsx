"use client";

import Image from "next/image";
import { Music } from "lucide-react";
import { usePlaylist } from "@/hooks/usePlaylist";
import { usePlayerStore } from "@/store/playerStore";

export function NowPlaying() {
  const { currentSong } = usePlaylist();
  const { isPlaying } = usePlayerStore();

  if (!currentSong?.songs) {
    return (
      <div className="flex items-center gap-4 p-4 border rounded-lg">
        <div className="p-3 bg-muted rounded-full">
          <Music className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Nenhuma música tocando</p>
          <p className="font-medium">Aguardando...</p>
        </div>
      </div>
    );
  }

  const song = currentSong.songs;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg bg-primary/5">
      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
        {song.thumbnail ? (
          <Image
            src={song.thumbnail}
            alt={song.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <Music className="h-8 w-8 m-auto text-muted-foreground" />
        )}
        {isPlaying && (
          <div className="absolute bottom-1 right-1 flex items-end gap-0.5 h-3">
            <div className="w-1 bg-primary animate-pulse" style={{ height: "40%" }} />
            <div className="w-1 bg-primary animate-pulse delay-75" style={{ height: "70%" }} />
            <div className="w-1 bg-primary animate-pulse delay-150" style={{ height: "100%" }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">
          {isPlaying ? "Tocando agora" : "Pausado"}
        </p>
        <p className="font-semibold truncate">{song.title}</p>
        <p className="text-sm text-muted-foreground truncate">
          {song.profiles?.full_name || "Desconhecido"}
        </p>
      </div>
    </div>
  );
}
