"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music, Play, Disc, Settings, LogOut, X, User } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { useAuthStore } from "@/store/authStore";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const supabase = createClient();

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const setUser = useAuthStore((state) => state.setUser);
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/login");
  };

  const mainNavItems = [
    { href: "/dashboard", label: "Playlist", icon: Music },
    { href: "/player", label: "Player", icon: Play },
    { href: "/my-songs", label: "Minhas Músicas", icon: Disc },
  ];

  const secondaryNavItems = [
    { href: "/administracao/dashboard", label: "Administração", icon: Settings },
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden">
          <Music className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Music className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">KaraokeFlow</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className="block">
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="my-4 border-t" />
              <p className="px-3 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Administração
              </p>
              {secondaryNavItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link key={item.href} href={item.href} className="block">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="border-t pt-4 mt-4">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>

        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between px-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm">
                <p className="font-medium truncate max-w-40">
                  {user?.full_name || user?.email}
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
