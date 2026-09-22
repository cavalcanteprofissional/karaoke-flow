"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => setSession(data.session?.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  return children;
}
