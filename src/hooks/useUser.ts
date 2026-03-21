"use client";

import { useAuthStore } from "@/store/authStore";
import { type Profile } from "@/lib/supabase/types";

export function useUser(): Profile | null {
  const user = useAuthStore((state) => state.user);
  return user;
}
