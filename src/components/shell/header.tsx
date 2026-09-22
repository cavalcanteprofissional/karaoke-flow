"use client";

import Link from "next/link";
import { Mic2 } from "lucide-react";

import { ThemeToggle } from "@/components/shared/theme-toggle";

type HeaderProps = {
  actions?: React.ReactNode;
};

export function Header({ actions }: HeaderProps) {
  return (
    <header className="pt-safe border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl">
            <Mic2 className="size-5" />
          </span>
          <span className="text-base font-semibold tracking-tight">Karaokê Party</span>
        </Link>
        <div className="flex items-center gap-1">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
