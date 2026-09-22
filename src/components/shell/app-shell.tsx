"use client";

import { Header } from "@/components/shell/header";
import { cn } from "cn";

type AppShellProps = {
  children: React.ReactNode;
  nav?: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
};

export function AppShell({ children, nav, className, headerActions }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header actions={headerActions} />
      <main className={cn("mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-28", className)}>
        {children}
      </main>
      {nav}
    </div>
  );
}
