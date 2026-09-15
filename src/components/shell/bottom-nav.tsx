"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "cn";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  matchExact?: boolean;
};

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-md md:hidden">
      <div className="grid h-16 grid-cols-[repeat(auto-fit,minmax(0,1fr))] items-center px-2">
        {items.map((item) => {
          const active = item.matchExact
            ? pathname === item.href
            : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="size-6" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}