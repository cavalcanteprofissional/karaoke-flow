import { Header } from "@/components/shell/header";
import { BottomNav, type NavItem } from "@/components/shell/bottom-nav";
import { cn } from "cn";

type AppShellProps = {
  children: React.ReactNode;
  navItems?: NavItem[];
  className?: string;
};

export function AppShell({ children, navItems, className }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className={cn("mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4", className)}>
        {children}
      </main>
      {navItems && navItems.length > 0 && <BottomNav items={navItems} />}
    </div>
  );
}