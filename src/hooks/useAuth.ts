"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { type Profile } from "@/lib/supabase/types";

export function useAuth(requireAuth = false) {
  const router = useRouter();
  const supabase = createClient();
  const store = useAuthStore();
  const { user, setUser, isLoading: storeLoading, setLoading, isAdmin } = store;

  const [localLoading, setLocalLoading] = useState(true);

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
    console.log("[useAuth] useEffect fired, requireAuth:", requireAuth);
    
    const initAuth = async () => {
      console.log("[useAuth] initAuth start");
      setLocalLoading(true);
      setLoading(true);

      try {
        // Timeout de 10 segundos
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Auth timeout")), 10000);
        });

        const sessionPromise = supabase.auth.getSession();
        
        const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);

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
        setLocalLoading(false);
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

  const isLoading = localLoading || storeLoading;

  return {
    user,
    isLoading,
    isAdmin: isAdmin(),
    signOut,
  };
}
