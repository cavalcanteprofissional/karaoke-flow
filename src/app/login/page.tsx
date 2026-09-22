import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { Header } from "@/components/shell/header";
import { AUTH_PROVIDERS } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const { error } = await searchParams;
  const devLoginEnabled = process.env.NODE_ENV === "development";

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
        <LoginForm
          providers={AUTH_PROVIDERS}
          error={error}
          devLoginEnabled={devLoginEnabled}
        />
      </main>
    </div>
  );
}
