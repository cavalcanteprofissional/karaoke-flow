import { create } from "zustand";
import { type Profile } from "@/lib/supabase/types";

interface AuthState {
  user: Profile | null;
  isLoading: boolean;
  setUser: (user: Profile | null) => void;
  setLoading: (isLoading: boolean) => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  isAdmin: () => get().user?.role === "admin",
}));
