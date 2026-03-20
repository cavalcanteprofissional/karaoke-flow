import { create } from "zustand";

interface PlayerStore {
  videoId: string | null;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  setVideoId: (videoId: string | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsMuted: (isMuted: boolean) => void;
  setVolume: (volume: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  videoId: null,
  isPlaying: false,
  isMuted: false,
  volume: 100,
  currentTime: 0,
  duration: 0,
  setVideoId: (videoId) => set({ videoId }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setVolume: (volume) => set({ volume }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  reset: () =>
    set({
      videoId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    }),
}));
