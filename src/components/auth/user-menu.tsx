"use client";

import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth-store";

function initials(name: string | null, email: string) {
  const source = name ?? email;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu() {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return null;
  }

  const userInitials = initials(user.user_metadata.full_name ?? null, user.email ?? "");
  const displayName = user.user_metadata.full_name ?? user.email ?? "Conta";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-3">
        <span className="bg-secondary text-secondary-foreground flex size-8 items-center justify-center rounded-full text-xs font-semibold">
          {userInitials || "?"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col px-2">
          <span className="truncate font-medium">{displayName}</span>
          {user.email && (
            <span className="text-muted-foreground truncate text-xs font-normal">
              {user.email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
