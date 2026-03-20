"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { type Profile } from "@/lib/supabase/types";

export function useAuth(requireAuth = false) {
  const router = useRouter();
  const supabase = createClient();
  const { user, setUser, isLoading, setLoading, isAdmin } = useAuthStore();

  useEffect(() => {
    const getUser = async () => {
      setLoading(true);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .single();

        setUser(profile as Profile);
      } else {
        setUser(null);
        if (requireAuth) {
          router.push("/login");
        }
      }
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        setUser(profile as Profile);
      } else {
        setUser(null);
        if (requireAuth) {
          router.push("/login");
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router, setUser, setLoading, requireAuth]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/login");
  };

  return {
    user,
    isLoading,
    isAdmin: isAdmin(),
    signOut,
  };
}
