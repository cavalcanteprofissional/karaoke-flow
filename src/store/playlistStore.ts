import { create } from "zustand";
import { type PlaylistItem, type PlayerState } from "@/lib/supabase/types";

interface PlaylistStore {
  playlist: PlaylistItem[];
  currentSong: PlaylistItem | null;
  playerState: PlayerState | null;
  isLoading: boolean;
  setPlaylist: (playlist: PlaylistItem[]) => void;
  setCurrentSong: (song: PlaylistItem | null) => void;
  setPlayerState: (state: PlayerState | null) => void;
  setLoading: (loading: boolean) => void;
  addToPlaylist: (item: PlaylistItem) => void;
  removeFromPlaylist: (id: string) => void;
  reorderPlaylist: (items: PlaylistItem[]) => void;
}

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  playlist: [],
  currentSong: null,
  playerState: null,
  isLoading: true,
  setPlaylist: (playlist) => set({ playlist }),
  setCurrentSong: (currentSong) => set({ currentSong }),
  setPlayerState: (playerState) => set({ playerState }),
  setLoading: (isLoading) => set({ isLoading }),
  addToPlaylist: (item) =>
    set((state) => ({
      playlist: [...state.playlist, item].sort((a, b) => a.position - b.position),
    })),
  removeFromPlaylist: (id) =>
    set((state) => ({
      playlist: state.playlist.filter((item) => item.id !== id),
    })),
  reorderPlaylist: (items) => set({ playlist: items }),
}));
