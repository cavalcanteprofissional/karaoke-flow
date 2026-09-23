"use client";

import { useState } from "react";
import { AlertCircle, LoaderCircle, ShieldAlert, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  DiscordIcon,
  FacebookIcon,
  GitHubIcon,
  GoogleIcon,
  SpotifyIcon,
  XIcon,
} from "@/components/auth/provider-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthProviderConfig, AuthProviderId } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/client";
import { cn } from "cn";

const PROVIDER_ICONS: Record<AuthProviderId, typeof GoogleIcon> = {
  google: GoogleIcon,
  github: GitHubIcon,
  spotify: SpotifyIcon,
  discord: DiscordIcon,
  facebook: FacebookIcon,
  x: XIcon,
};

type LoginFormProps = {
  providers: AuthProviderConfig[];
  error?: string;
  devLoginEnabled: boolean;
};

export function LoginForm({ providers, error, devLoginEnabled }: LoginFormProps) {
  const router = useRouter();
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState("");
  const [devPassword, setDevPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleOAuth(provider: AuthProviderConfig) {
    setPendingProvider(provider.id as string);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider.id,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    setPendingProvider(null);
    if (error) {
      toast.error("Não foi possível iniciar o login.", {
        description: "Verifique se o provedor está configurado no projeto.",
      });
    }
  }

  async function handleAnonymous() {
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível entrar como visitante.", {
        description: "Verifique se o acesso anônimo está habilitado no projeto.",
      });
      return;
    }
    router.push("/entrar");
    router.refresh();
  }

  async function handleDevLogin(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: devEmail.trim(),
      password: devPassword,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Credenciais inválidas.", {
        description: "Use os usuários criados pelo `npm run seed`.",
      });
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm self-center">
      <CardHeader>
        <CardTitle className="text-lg">Entrar na sua conta</CardTitle>
        <CardDescription>
          Entre sem login para pedir músicas pelo QR do bar. Para abrir o seu próprio
          bar, faça login com uma conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={submitting}
            onClick={handleAnonymous}
          >
            {submitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <UserRound className="size-4" />
            )}
            Continuar sem login
          </Button>

          <div className="text-muted-foreground relative flex items-center gap-2 text-xs">
            <span className="bg-border h-px flex-1" />
            ou entre com
            <span className="bg-border h-px flex-1" />
          </div>

          {providers.map((provider) => {
            const Icon = PROVIDER_ICONS[provider.id as AuthProviderId];
            const pending = pendingProvider === provider.id;
            const disabled = provider.disabled === true || pendingProvider !== null;
            return (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                size="lg"
                disabled={disabled}
                title={provider.disabledReason}
                onClick={() => handleOAuth(provider)}
              >
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Icon className="size-4" />
                )}
                {provider.label}
                {provider.disabled === true && (
                  <span className="text-muted-foreground ml-auto text-xs font-normal">
                    em breve
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        {devLoginEnabled && (
          <>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="bg-border h-px flex-1" />
              ou
              <span className="bg-border h-px flex-1" />
            </div>

            <form
              onSubmit={handleDevLogin}
              className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-3"
            >
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <ShieldAlert className="size-3.5" />
                Acesso de desenvolvimento
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-email" className="text-xs">
                  E-mail
                </Label>
                <Input
                  id="dev-email"
                  type="email"
                  autoComplete="username"
                  placeholder="dono@exemplo.com"
                  value={devEmail}
                  onChange={(event) => setDevEmail(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dev-password" className="text-xs">
                  Senha
                </Label>
                <Input
                  id="dev-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="senha123"
                  value={devPassword}
                  onChange={(event) => setDevPassword(event.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={submitting}
                className={cn(submitting && "opacity-80")}
              >
                {submitting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                Entrar (dev)
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}