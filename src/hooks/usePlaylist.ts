"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePlaylistStore } from "@/store/playlistStore";
import { useAuthStore } from "@/store/authStore";
import { type PlaylistItem, type PlayerState } from "@/lib/supabase/types";

const supabase = createClient();
const POLL_INTERVAL = 5000;

export function usePlaylist() {
  const { user } = useAuthStore();
  const {
    playlist,
    currentSong,
    playerState,
    isLoading,
    setPlaylist,
    setCurrentSong,
    setPlayerState,
    setLoading,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
  } = usePlaylistStore();

  const [useRealtime, setUseRealtime] = useState(true);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPlaylist = useCallback(async () => {
    if (!user) return;

    try {
      const { data: playlistData } = await supabase
        .from("playlist")
        .select(`*, songs (*, profiles (full_name))`)
        .order("position", { ascending: true });

      setPlaylist((playlistData as PlaylistItem[]) || []);

      const { data: playerData } = await supabase
        .from("player_state")
        .select("*")
        .eq("id", "main")
        .maybeSingle();

      if (playerData) {
        setPlayerState(playerData as PlayerState);
        if (playerData.current_song_id) {
          const current = (playlistData as PlaylistItem[])?.find(
            (item) => item.song_id === playerData.current_song_id
          );
          setCurrentSong(current || null);
        }
      }
    } catch (error) {
      console.error("[usePlaylist] Error fetching:", error);
    }
  }, [user, setPlaylist, setCurrentSong, setPlayerState]);

  const handlePlaylistChange = useCallback(async (payload: { eventType: string; new?: { id: string }; old?: { id: string } }) => {
    if (payload.eventType === "INSERT" && payload.new) {
      const { data } = await supabase
        .from("playlist")
        .select(`*, songs (*, profiles (full_name))`)
        .eq("id", payload.new.id)
        .single();

      if (data) {
        addToPlaylist(data as PlaylistItem);
      }
    } else if (payload.eventType === "DELETE" && payload.old) {
      removeFromPlaylist(payload.old.id);
    } else if (payload.eventType === "UPDATE") {
      await fetchPlaylist();
    }
  }, [addToPlaylist, removeFromPlaylist, fetchPlaylist]);

  const handlePlayerStateChange = useCallback(async (payload: { new: PlayerState }) => {
    const newState = payload.new;
    setPlayerState(newState);

    if (newState.current_song_id) {
      const { data: playlistData } = await supabase
        .from("playlist")
        .select(`*, songs (*, profiles (full_name))`)
        .eq("song_id", newState.current_song_id)
        .single();

      if (playlistData) {
        setCurrentSong(playlistData as PlaylistItem);
      }
    } else {
      setCurrentSong(null);
    }
  }, [setCurrentSong, setPlayerState]);

  const setupRealtime = useCallback(() => {
    if (realtimeRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel("playlist-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "playlist" },
        async (payload: { eventType: string; new?: { id: string }; old?: { id: string } }) => {
          await handlePlaylistChange(payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_state" },
        async (payload: { new: PlayerState }) => {
          await handlePlayerStateChange(payload);
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log("[usePlaylist] Realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[usePlaylist] Realtime failed, switching to polling");
          setUseRealtime(false);
        }
      });

    realtimeRef.current = channel;
  }, [handlePlaylistChange, handlePlayerStateChange]);

  const setupPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    console.log("[usePlaylist] Starting polling every", POLL_INTERVAL, "ms");
    pollIntervalRef.current = setInterval(fetchPlaylist, POLL_INTERVAL);
  }, [fetchPlaylist]);

  const cleanup = useCallback(() => {
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!user) {
      cleanup();
      setPlaylist([]);
      setCurrentSong(null);
      setPlayerState(null);
      return;
    }

    setLoading(true);

    const init = async () => {
      await fetchPlaylist();
      setLoading(false);

      if (useRealtime) {
        setupRealtime();
      }

      if (!useRealtime) {
        setupPolling();
      }
    };

    init();

    return cleanup;
  }, [user, useRealtime, fetchPlaylist, setLoading, cleanup, setupRealtime, setupPolling, setPlaylist, setCurrentSong, setPlayerState]);

  useEffect(() => {
    if (!useRealtime && !pollIntervalRef.current && user) {
      setupPolling();
    } else if (useRealtime && realtimeRef.current && !pollIntervalRef.current) {
      cleanup();
    }
  }, [useRealtime, user, setupPolling, cleanup]);

  const removeSong = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("playlist").delete().eq("id", id);
      if (!error) {
        removeFromPlaylist(id);
      }
    },
    [removeFromPlaylist]
  );

  const reorder = useCallback(
    async (items: PlaylistItem[]) => {
      reorderPlaylist(items);
      for (let i = 0; i < items.length; i++) {
        await supabase
          .from("playlist")
          .update({ position: i })
          .eq("id", items[i].id);
      }
    },
    [reorderPlaylist]
  );

  const playSong = useCallback(
    async (songId: string) => {
      await supabase
        .from("player_state")
        .update({
          current_song_id: songId,
          status: "playing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", "main");
    },
    []
  );

  const skipToNext = useCallback(async () => {
    if (!currentSong || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((item) => item.id === currentSong.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < playlist.length) {
      const nextSong = playlist[nextIndex];
      await playSong(nextSong.song_id);
      setCurrentSong(nextSong);
    } else {
      await supabase
        .from("player_state")
        .update({ status: "idle", updated_at: new Date().toISOString() })
        .eq("id", "main");
      setCurrentSong(null);
    }
  }, [currentSong, playlist, playSong, setCurrentSong]);

  const pausePlayback = useCallback(async () => {
    await supabase
      .from("player_state")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", "main");
  }, []);

  const resumePlayback = useCallback(async () => {
    await supabase
      .from("player_state")
      .update({ status: "playing", updated_at: new Date().toISOString() })
      .eq("id", "main");
  }, []);

  return {
    playlist,
    currentSong,
    playerState,
    isLoading,
    fetchPlaylist,
    removeSong,
    reorder,
    playSong,
    skipToNext,
    pausePlayback,
    resumePlayback,
  };
}
