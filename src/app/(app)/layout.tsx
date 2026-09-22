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

  return (
    <>
      <ConsentSync />
      <AppShell headerActions={<UserMenu />} nav={<AppNav />}>
        {children}
      </AppShell>
    </>
  );
}
