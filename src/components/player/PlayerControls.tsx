"use client";

import { Play, Pause, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePlayerStore } from "@/store/playerStore";
import { useAuthStore } from "@/store/authStore";
import { usePlaylist } from "@/hooks/usePlaylist";

export function PlayerControls() {
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const { isPlaying, setIsPlaying, isMuted, setIsMuted, volume, setVolume, currentTime, duration } =
    usePlayerStore();
  const { pausePlayback, resumePlayback, skipToNext } = usePlaylist();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      await pausePlayback();
      setIsPlaying(false);
    } else {
      await resumePlayback();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground w-12">{formatTime(currentTime)}</span>
        <div className="flex-1">
          <Slider
            value={[duration > 0 ? (currentTime / duration) * 100 : 0]}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
        <span className="text-sm text-muted-foreground w-12">{formatTime(duration)}</span>
      </div>

      <div className="flex items-center justify-center gap-4">
        {isAdmin && (
          <Button variant="ghost" size="icon" onClick={skipToNext}>
            <SkipForward className="h-5 w-5" />
          </Button>
        )}

        <Button
          variant="default"
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={handlePlayPause}
          disabled={!isAdmin}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleMute}>
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <VolumeX className="h-4 w-4 text-muted-foreground" />
        <Slider
          value={[isMuted ? 0 : volume]}
          max={100}
          step={1}
          onValueChange={([val]) => {
            setVolume(val);
            if (val > 0 && isMuted) setIsMuted(false);
          }}
          className="w-24"
        />
        <Volume2 className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
