"use client";

import { usePlaylist } from "@/hooks/usePlaylist";
import { PlaylistTable } from "@/components/playlist/PlaylistTable";
import { PlayerControls } from "@/components/player/PlayerControls";
import { NowPlaying } from "@/components/player/NowPlaying";
import { YouTubePlayer } from "@/components/player/YouTubePlayer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListMusic } from "lucide-react";

export default function PlaylistManagerPage() {
  const { playlist, currentSong, removeSong, reorder, playSong } = usePlaylist();

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newPlaylist = [...playlist];
    [newPlaylist[index - 1], newPlaylist[index]] = [newPlaylist[index], newPlaylist[index - 1]];
    reorder(newPlaylist);
  };

  const handleMoveDown = (index: number) => {
    if (index === playlist.length - 1) return;
    const newPlaylist = [...playlist];
    [newPlaylist[index], newPlaylist[index + 1]] = [newPlaylist[index + 1], newPlaylist[index]];
    reorder(newPlaylist);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gerenciar Playlist</h1>
        <p className="text-muted-foreground">
          Reordene, remova músicas e controle a reprodução.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListMusic className="h-5 w-5" />
                Playlist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlaylistTable
                playlist={playlist}
                currentSongId={currentSong?.song_id || null}
                onPlay={playSong}
                onRemove={removeSong}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                isAdmin={true}
                isLoading={false}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Player</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <YouTubePlayer videoId={currentSong?.songs?.youtube_id || null} />
              <PlayerControls />
              <NowPlaying />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
