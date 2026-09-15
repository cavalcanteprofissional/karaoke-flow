"use client";

import { useEffect, useRef, useCallback, useState } from "react";
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
  videoIds: string[];
  onVideoEnd?: () => void;
}

export function YouTubePlayer({ videoIds, onVideoEnd }: YouTubePlayerProps) {
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setIsPlaying, setCurrentTime, setDuration, isMuted, volume } = usePlayerStore();
  const { playerState } = usePlaylist();

  const handlePlaylistEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
    onVideoEnd?.();
  }, [setIsPlaying, onVideoEnd]);

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
            listType: "playlist",
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              setDuration(event.target.getDuration() || 0);
              setIsPlayerReady(true);
              console.log("[YouTubePlayer] Player ready");
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                const currentIndex = playerRef.current?.getPlaylistIndex() || 0;
                setCurrentIndex(currentIndex);
              } else if (
                event.data === window.YT.PlayerState.PAUSED ||
                event.data === window.YT.PlayerState.ENDED
              ) {
                setIsPlaying(false);
                if (event.data === window.YT.PlayerState.ENDED) {
                  const nextIndex = (playerRef.current?.getPlaylistIndex() || 0) + 1;
                  if (nextIndex >= videoIds.length) {
                    handlePlaylistEnd();
                  }
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
  }, [setIsPlaying, setDuration, handlePlaylistEnd, setIsPlayerReady, videoIds]);

  useEffect(() => {
    if (!isPlayerReady) {
      console.log("[YouTubePlayer] Player not ready yet, skipping playlist load");
      return;
    }
    
    if (playerRef.current && videoIds.length > 0) {
      // Verificar se já está tocando a mesma playlist
      const currentList = playerRef.current.getPlaylist?.();
      const isSamePlaylist = currentList && 
        currentList.length === videoIds.length && 
        currentList.every((id: string, i: number) => id === videoIds[i]);
      
      if (!isSamePlaylist) {
        console.log("[YouTubePlayer] Loading playlist:", videoIds);
        // Delay para garantir que o player está 100% pronto
        setTimeout(() => {
          playerRef.current?.loadPlaylist(videoIds, 0);
        }, 100);
      } else {
        console.log("[YouTubePlayer] Same playlist already loaded, skipping");
      }
      setIsPlaying(playerState?.status === "playing");
    }
  }, [videoIds, playerState?.status, setIsPlaying, isPlayerReady]);

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
    if (!playerRef.current) return;

    const interval = setInterval(() => {
      if (playerRef.current) {
        const currentTime = playerRef.current.getCurrentTime?.() || 0;
        const duration = playerRef.current.getDuration?.() || 0;
        setCurrentTime(currentTime);
        if (duration > 0) {
          setDuration(duration);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [setCurrentTime, setDuration]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {videoIds.length === 0 && (
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
