"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "cn";
import { NAV_ITEMS } from "@/components/shell/app-nav";

/**
 * Navegação do topo para tablet/desktop (`md+`). O `BottomNav` é `md:hidden`,
 * então sem isto o app ficava sem navegação nenhuma em telas largas. Mesmos
 * itens e a mesma regra de item ativo do `BottomNav` (`NAV_ITEMS`).
 */
export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
      {NAV_ITEMS.map((item) => {
        const active = item.matchExact
          ? pathname === item.href
          : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/5 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
