import { redirect } from "next/navigation";

import { ConsentSync } from "@/components/consent/consent-sync";
import { UserMenu } from "@/components/auth/user-menu";
import { AppNav } from "@/components/shell/app-nav";
import { AppShell } from "@/components/shell/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Espelha `security_manual_linking_enabled` do projeto Supabase. Default OFF
  // (fail-closed): sem a env, o botão "Vincular GitHub" não aparece. Só ligue
  // junto com `npm run enable:manual-linking`, senão o botão some e a flag fica
  // ligada sem uso.
  const manualLinkingEnabled = process.env.NEXT_PUBLIC_ENABLE_MANUAL_LINKING === "1";

  return (
    <>
      <ConsentSync />
      <AppShell
        headerActions={<UserMenu manualLinkingEnabled={manualLinkingEnabled} />}
        nav={<AppNav />}
      >
        {children}
      </AppShell>
    </>
  );
}
