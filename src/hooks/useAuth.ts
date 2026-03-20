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

  const syncProfile = async (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
    const googleName = authUser.user_metadata?.full_name as string | undefined;
    const googleAvatar = authUser.user_metadata?.avatar_url as string | undefined;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (profile) {
      if (googleName && profile.full_name !== googleName) {
        await supabase
          .from("profiles")
          .update({ full_name: googleName })
          .eq("id", authUser.id);
        profile.full_name = googleName;
      }
      if (googleAvatar && profile.avatar_url !== googleAvatar) {
        await supabase
          .from("profiles")
          .update({ avatar_url: googleAvatar })
          .eq("id", authUser.id);
        profile.avatar_url = googleAvatar;
      }
    }

    return profile;
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setLoading(true);
      if (session?.user) {
        const profile = await syncProfile(session.user);
        setUser(profile as Profile);
      } else {
        setUser(null);
        if (requireAuth) {
          router.push("/login");
        }
      }
      setLoading(false);
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
