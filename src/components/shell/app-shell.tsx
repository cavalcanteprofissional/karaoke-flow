"use client";

import { Header } from "@/components/shell/header";
import { cn } from "cn";

type AppShellProps = {
  children: React.ReactNode;
  nav?: React.ReactNode;
  headerNav?: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
};

export function AppShell({
  children,
  nav,
  headerNav,
  className,
  headerActions,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header nav={headerNav} actions={headerActions} />
      {/* `pb-28` abre espaço para o bottom-nav (só existe no mobile); a partir
          de `md` o bottom-nav some e a navegação vai para o topo, então o
          padding inferior pode encolher. */}
      <main className={cn("kf-container flex-1 pt-4 pb-28 md:pb-10", className)}>
        {children}
      </main>
      {nav}
    </div>
  );
}
