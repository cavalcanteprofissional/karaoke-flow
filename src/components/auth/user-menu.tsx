"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { SetPasswordItem } from "@/components/auth/set-password-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";

type UserMenuProps = {
  /**
   * `security_manual_linking_enabled` no Auth. Lida no server e passada por
   * prop porque é flag de serviço — o client não deve consultá-la a cada render.
   */
  manualLinkingEnabled?: boolean;
};

function initials(name: string | null, email: string) {
  const source = name ?? email;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function LinkGitHubIdentity() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLink() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.linkIdentity({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    setPending(false);
    if (error) {
      toast.error("Não foi possível vincular o GitHub.", {
        description: error.message,
      });
      return;
    }
    toast.success("GitHub vinculado. Agora entre com o GitHub em qualquer lugar.");
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleLink}
      className="text-muted-foreground hover:text-foreground flex w-full items-center justify-start gap-2 rounded-sm px-2 py-1.5 text-sm font-medium outline-none disabled:opacity-60"
    >
      <Link2 className="size-4" />
      {pending ? "Sincronizando…" : "Vincular GitHub"}
    </button>
  );
}

export function UserMenu({ manualLinkingEnabled = false }: UserMenuProps) {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return null;
  }

  const isAnonymous = user.is_anonymous ?? user.app_metadata?.is_anonymous === true;
  const identities = user.identities ?? [];
  const hasGithub = identities.some((identity) => identity.provider === "github");
  // `linkIdentity` é o único jeito de travar um GitHub numa conta que nasceu
  // por e-mail, mas é também a rota de account takeover: qualquer OAuth cujo
  // e-mail bata com uma conta existente vira dono dela. Só fica no ar quando o
  // dono liga a flag de propósito (helper `scripts/enable-manual-linking.mjs`).
  const showLinkGitHub = manualLinkingEnabled && !isAnonymous && !hasGithub;
  const userInitials = isAnonymous
    ? "V"
    : initials(user.user_metadata.full_name ?? null, user.email ?? "");
  const displayName = isAnonymous
    ? "Visitante"
    : (user.user_metadata.full_name ?? user.email ?? "Conta");

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
        {showLinkGitHub && (
          <>
            <div className="flex flex-col gap-1 px-2 pt-1.5 pb-1">
              <span className="text-muted-foreground px-2 text-xs">
                Entre com o GitHub no celular/usando a nuvem — mesma conta, uma vez só.
              </span>
              <LinkGitHubIdentity />
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {!isAnonymous && (
          <>
            <div className="px-2 pt-1.5 pb-1">
              <span className="text-muted-foreground block px-2 pb-1 text-xs">
                {hasGithub
                  ? "Sua conta entrou pelo GitHub. Uma senha também deixa você entrar sem depender do GitHub."
                  : "Sua conta não tem senha ainda. Defina uma para conseguir entrar por e-mail."}
              </span>
              <SetPasswordItem hasProvider={hasGithub} />
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
