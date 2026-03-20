"use client";

import { useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePlaylistStore } from "@/store/playlistStore";
import { useAuthStore } from "@/store/authStore";
import { type PlaylistItem, type PlayerState } from "@/lib/supabase/types";

export function usePlaylist() {
  const supabase = createClient();
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

  const fetchPlaylist = useCallback(async () => {
    setLoading(true);

    const { data: playlistData, error: playlistError } = await supabase
      .from("playlist")
      .select(`
        *,
        songs (
          *,
          profiles (full_name)
        )
      `)
      .order("position", { ascending: true });

    if (playlistError) {
      console.error("Error fetching playlist:", playlistError);
      setLoading(false);
      return;
    }

    setPlaylist((playlistData as PlaylistItem[]) || []);

    const { data: playerData } = await supabase
      .from("player_state")
      .select("*")
      .eq("id", "main")
      .single();

    if (playerData) {
      setPlayerState(playerData as PlayerState);

      if (playerData.current_song_id) {
        const current = (playlistData as PlaylistItem[])?.find(
          (item) => item.song_id === playerData.current_song_id
        );
        setCurrentSong(current || null);
      }
    }

    setLoading(false);
  }, [supabase, setPlaylist, setCurrentSong, setPlayerState, setLoading]);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  const removeSong = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("playlist").delete().eq("id", id);

      if (!error) {
        removeFromPlaylist(id);
      }
    },
    [supabase, removeFromPlaylist]
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
    [supabase, reorderPlaylist]
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
    [supabase]
  );

  const skipToNext = useCallback(async () => {
    if (!currentSong || playlist.length === 0) return;

    const currentIndex = playlist.findIndex(
      (item) => item.id === currentSong.id
    );
    const nextIndex = currentIndex + 1;

    if (nextIndex < playlist.length) {
      const nextSong = playlist[nextIndex];
      await playSong(nextSong.song_id);
      setCurrentSong(nextSong);
    } else {
      await supabase
        .from("player_state")
        .update({
          status: "idle",
          updated_at: new Date().toISOString(),
        })
        .eq("id", "main");
      setCurrentSong(null);
    }
  }, [currentSong, playlist, playSong, setCurrentSong, supabase]);

  const pausePlayback = useCallback(async () => {
    await supabase
      .from("player_state")
      .update({
        status: "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("id", "main");
  }, [supabase]);

  const resumePlayback = useCallback(async () => {
    await supabase
      .from("player_state")
      .update({
        status: "playing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", "main");
  }, [supabase]);

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
