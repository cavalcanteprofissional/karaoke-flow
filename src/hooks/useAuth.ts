"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { type Profile } from "@/lib/supabase/types";

export function useAuth(requireAuth = false) {
  const router = useRouter();
  const supabase = createClient();
  const { user, setUser, setLoading, isLoading, isAdmin } = useAuthStore();
  
  const initRef = useRef(false);

  const syncProfile = async (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
    console.log("[useAuth] syncing profile for:", authUser.id);
    try {
      let { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (error?.code === "PGRST116") {
        console.log("[useAuth] Profile not found, creating...");
        const { data: newProfile, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: authUser.id,
            email: authUser.email || '',
            full_name: authUser.user_metadata?.full_name as string || '',
          })
          .select("*")
          .single();

        if (insertError) {
          console.error("[useAuth] Profile creation error:", insertError);
          return null;
        }
        profile = newProfile;
      } else if (error) {
        console.error("[useAuth] Profile fetch error:", error);
        return null;
      }

      if (profile) {
        const googleName = authUser.user_metadata?.full_name as string | undefined;
        const googleAvatar = authUser.user_metadata?.avatar_url as string | undefined;

        if ((googleName && profile.full_name !== googleName) || (googleAvatar && profile.avatar_url !== googleAvatar)) {
          const updates: Record<string, string> = {};
          if (googleName && profile.full_name !== googleName) updates.full_name = googleName;
          if (googleAvatar && profile.avatar_url !== googleAvatar) updates.avatar_url = googleAvatar;

          await supabase
            .from("profiles")
            .update(updates)
            .eq("id", authUser.id);
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
    if (initRef.current) return;
    initRef.current = true;

    const initAuth = async () => {
      setLoading(true);

      try {
        const { data } = await supabase.auth.getSession();

        if (data?.session?.user) {
          const profile = await syncProfile(data.session.user);
          setUser(profile as Profile);
        } else {
          setUser(null);
          if (requireAuth) {
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
      }
    };

    initAuth();
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
