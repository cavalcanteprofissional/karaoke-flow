"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { type Profile } from "@/lib/supabase/types";

const supabase = createClient();

export function useAuth(requireAuth = false) {
  const router = useRouter();
  const { user, setUser, setLoading, isLoading } = useAuthStore();
  const initRef = useRef(false);

  const syncProfile = useCallback(async (authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
    try {
      let { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (error?.code === "PGRST116") {
        const { data: newProfile, error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: authUser.id,
            email: authUser.email || '',
            full_name: authUser.user_metadata?.full_name as string || '',
          })
          .select("*")
          .single();

        if (insertError) return null;
        profile = newProfile;
      } else if (error) {
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

      return profile;
    } catch {
      return null;
    }
  }, []);

  const getAdminStatus = useCallback(() => {
    return user?.role === "admin";
  }, [user?.role]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initAuth = async () => {
      setLoading(true);

      try {
        const { data } = await supabase.auth.getSession();

        if (data?.session?.user) {
          const profile = await syncProfile(data.session.user);
          if (profile) {
            setUser(profile as Profile);
          } else {
            setUser({
              id: data.session.user.id,
              email: data.session.user.email || '',
              full_name: (data.session.user.user_metadata?.full_name as string) || '',
              role: 'user',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              avatar_url: (data.session.user.user_metadata?.avatar_url as string) || '',
            } as Profile);
          }
        } else {
          setUser(null);
          if (requireAuth) {
            router.push("/login");
          }
        }
      } catch {
        setUser(null);
        if (requireAuth) {
          router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [router, setUser, setLoading, requireAuth, syncProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/login");
  }, [router, setUser]);

  return {
    user,
    isLoading,
    isAdmin: getAdminStatus(),
    signOut,
  };
}
