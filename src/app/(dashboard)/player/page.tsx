"use client";

import { usePlaylist } from "@/hooks/usePlaylist";
import { YouTubePlayer } from "@/components/player/YouTubePlayer";
import { PlayerControls } from "@/components/player/PlayerControls";
import { NowPlaying } from "@/components/player/NowPlaying";

export default function PlayerPage() {
  const { playlist } = usePlaylist();
  const videoIds = playlist.map(p => p.songs?.youtube_id).filter(Boolean) as string[];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-8 text-center">Player</h1>

      <div className="space-y-8">
        <YouTubePlayer videoIds={videoIds} />

        <div className="space-y-6">
          <PlayerControls />
          <NowPlaying />
        </div>
      </div>
    </div>
  );
}
