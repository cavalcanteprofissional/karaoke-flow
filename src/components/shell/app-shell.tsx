"use client";

import { Header } from "@/components/shell/header";
import { cn } from "cn";

type AppShellProps = {
  children: React.ReactNode;
  nav?: React.ReactNode;
  headerNav?: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  /**
   * Rodapé fora do `<main>`. `<footer>` dentro de `main` **não** é exposto como
   * landmark `contentinfo` (só vale se não for descendente de `main`/`nav`/…),
   * então quem navega por landmarks perdia o rodapé nas telas de app — que era
   * o caso até aqui, onde o `SiteFooter` entrava junto com `children`.
   */
  footer?: React.ReactNode;
};

export function AppShell({
  children,
  nav,
  headerNav,
  className,
  headerActions,
  footer,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header nav={headerNav} actions={headerActions} />
      {/* `pb-4` só reserva o espaço tipográfico: a folga para o `bottom-nav`
          fixo (mobile) foi para o wrapper do rodapé, que é quem fica no fim da
          coluna — se ficasse aqui, o rodapé desceria por baixo da nav. */}
      <main className={cn("kf-container flex-1 pt-4 pb-4", className)}>{children}</main>
      {footer && <div className="pb-28 md:pb-10">{footer}</div>}
      {nav}
    </div>
  );
}
