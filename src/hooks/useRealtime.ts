"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePlaylistStore } from "@/store/playlistStore";
import { type PlaylistItem, type PlayerState } from "@/lib/supabase/types";

export function useRealtime() {
  const supabase = createClient();
  const { setPlaylist, setCurrentSong, setPlayerState } = usePlaylistStore();

  useEffect(() => {
    const channel = supabase
      .channel("playlist-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playlist",
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const { data } = await supabase
              .from("playlist")
              .select(`
                *,
                songs (
                  *,
                  profiles (full_name)
                )
              `)
              .eq("id", payload.new.id)
              .single();

            if (data) {
              usePlaylistStore.getState().addToPlaylist(data as PlaylistItem);
            }
          } else if (payload.eventType === "DELETE") {
            usePlaylistStore.getState().removeFromPlaylist(payload.old.id);
          } else if (payload.eventType === "UPDATE") {
            const { data: playlistData } = await supabase
              .from("playlist")
              .select(`
                *,
                songs (
                  *,
                  profiles (full_name)
                )
              `)
              .order("position", { ascending: true });

            if (playlistData) {
              setPlaylist(playlistData as PlaylistItem[]);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "player_state",
        },
        async (payload) => {
          const newState = payload.new as PlayerState;
          setPlayerState(newState);

          if (newState.current_song_id) {
            const { data: playlistData } = await supabase
              .from("playlist")
              .select(`
                *,
                songs (
                  *,
                  profiles (full_name)
                )
              `)
              .eq("song_id", newState.current_song_id)
              .single();

            if (playlistData) {
              setCurrentSong(playlistData as PlaylistItem);
            }
          } else {
            setCurrentSong(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, setPlaylist, setCurrentSong, setPlayerState]);
}
