import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { type Profile } from "@/lib/supabase/types";

interface AuthState {
  user: Profile | null;
  isLoading: boolean;
  setUser: (user: Profile | null) => void;
  setLoading: (isLoading: boolean) => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      isAdmin: () => get().user?.role === "admin",
    }),
    { name: "auth-store" }
  )
);
