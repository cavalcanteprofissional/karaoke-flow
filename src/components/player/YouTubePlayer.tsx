"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/store/playerStore";
import { usePlaylist } from "@/hooks/usePlaylist";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: typeof YT;
  }
}

interface YouTubePlayerProps {
  videoId: string | null;
  onVideoEnd?: () => void;
}

export function YouTubePlayer({ videoId, onVideoEnd }: YouTubePlayerProps) {
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setIsPlaying, setCurrentTime, setDuration, isMuted, volume } = usePlayerStore();
  const { skipToNext, playerState } = usePlaylist();

  const handleVideoEnd = useCallback(() => {
    setIsPlaying(false);
    skipToNext();
    onVideoEnd?.();
  }, [skipToNext, setIsPlaying, onVideoEnd]);

  useEffect(() => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      if (containerRef.current && !playerRef.current) {
        playerRef.current = new window.YT.Player(containerRef.current, {
          height: "100%",
          width: "100%",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            origin: window.location.origin,
            rel: 0,
            showinfo: 0,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              setDuration(event.target.getDuration());
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (
                event.data === window.YT.PlayerState.PAUSED ||
                event.data === window.YT.PlayerState.ENDED
              ) {
                setIsPlaying(false);
                if (event.data === window.YT.PlayerState.ENDED) {
                  handleVideoEnd();
                }
              }
            },
          },
        });
      }
    };

    return () => {
      window.onYouTubeIframeAPIReady = () => {};
    };
  }, [setIsPlaying, setDuration, handleVideoEnd]);

  useEffect(() => {
    if (playerRef.current && videoId) {
      playerRef.current.loadVideoById(videoId);
      setIsPlaying(playerState?.status === "playing");
    }
  }, [videoId, playerState?.status, setIsPlaying]);

  useEffect(() => {
    if (playerRef.current) {
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    }
  }, [isMuted]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (playerRef.current) {
      interval = setInterval(() => {
        if (playerRef.current) {
          const currentTime = playerRef.current.getCurrentTime?.() || 0;
          const duration = playerRef.current.getDuration?.() || 0;
          setCurrentTime(currentTime);
          if (duration > 0) {
            setDuration(duration);
          }
        }
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [setCurrentTime, setDuration]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {!videoId && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>Aguardando música...</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
