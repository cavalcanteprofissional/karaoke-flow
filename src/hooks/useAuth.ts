"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { type Profile } from "@/lib/supabase/types";

export function useAuth(requireAuth = false) {
  const router = useRouter();
  const supabase = createClient();
  const { user, setUser, setLoading, isAdmin } = useAuthStore();
  
  const initRef = useRef(false);

  const syncProfile = async (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
    console.log("[useAuth] syncing profile for:", authUser.id);
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (error) {
        console.error("[useAuth] Profile fetch error:", error);
        return null;
      }

      if (profile) {
        const googleName = authUser.user_metadata?.full_name as string | undefined;
        const googleAvatar = authUser.user_metadata?.avatar_url as string | undefined;

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

      console.log("[useAuth] Profile synced:", profile);
      return profile;
    } catch (err) {
      console.error("[useAuth] syncProfile error:", err);
      return null;
    }
  };

  useEffect(() => {
    console.log("[useAuth] useEffect fired, requireAuth:", requireAuth, "initRef:", initRef.current);
    
    // Prevenir inicializações duplicadas do StrictMode
    if (initRef.current) {
      console.log("[useAuth] Already initialized, skipping");
      return;
    }
    initRef.current = true;

    const initAuth = async () => {
      console.log("[useAuth] initAuth start");
      setLoading(true);

      try {
        const { data, error } = await supabase.auth.getSession();

        console.log("[useAuth] Session result - user:", !!data?.session?.user, "error:", error);

        if (error) {
          console.error("[useAuth] Session error:", error);
        }

        if (data?.session?.user) {
          const profile = await syncProfile(data.session.user);
          setUser(profile as Profile);
        } else {
          setUser(null);
          if (requireAuth) {
            console.log("[useAuth] No user, redirecting to login");
            router.push("/login");
          }
        }
      } catch (err) {
        console.error("[useAuth] initAuth error:", err);
        setUser(null);
        if (requireAuth) {
          router.push("/login");
        }
      } finally {
        setLoading(false);
        console.log("[useAuth] initAuth complete");
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[useAuth] onAuthStateChange:", event, !!session?.user);
      if (session?.user) {
        const profile = await syncProfile(session.user);
        setUser(profile as Profile);
      } else {
        setUser(null);
        if (requireAuth) {
          router.push("/login");
        }
      }
    });

    return () => {
      console.log("[useAuth] Cleanup");
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
    isLoading: false,
    isAdmin: isAdmin(),
    signOut,
  };
}
