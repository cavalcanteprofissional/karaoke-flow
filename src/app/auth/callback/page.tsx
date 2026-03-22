"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Loader2 } from "lucide-react";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();
      const next = searchParams.get("next") || "/dashboard";

      try {
        setLoading(true);
        
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData?.session?.user) {
          setLoading(false);
          router.replace("/login");
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .single();

        if (error || !profile) {
          const newProfile = {
            id: sessionData.session.user.id,
            email: sessionData.session.user.email || '',
            full_name: sessionData.session.user.user_metadata?.full_name || '',
            role: 'user' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            avatar_url: sessionData.session.user.user_metadata?.avatar_url || '',
          };
          setUser(newProfile);
        } else {
          const updatedProfile = {
            ...profile,
            full_name: profile.full_name || sessionData.session.user.user_metadata?.full_name || '',
            avatar_url: profile.avatar_url || sessionData.session.user.user_metadata?.avatar_url || '',
          };
          setUser(updatedProfile);
        }

        setLoading(false);
        router.replace(next);
      } catch {
        setLoading(false);
        router.replace("/login");
      }
    };

    handleCallback();
  }, [searchParams, router, setUser, setLoading]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Autenticando...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
