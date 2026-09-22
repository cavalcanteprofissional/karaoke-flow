import type { Provider } from "@supabase/supabase-js";

export const AUTH_PROVIDER_IDS = ["google", "github"] as const;

export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export type AuthProviderConfig = {
  id: Provider;
  label: string;
  description: string;
};

/**
 * Provedores de autenticação disponíveis na interface de login.
 * Para adicionar X (Twitter) ou Meta no futuro, basta incluir o id aqui
 * (ambos exigem app review externo antes de produção).
 */
export const AUTH_PROVIDERS: AuthProviderConfig[] = [
  { id: "google", label: "Google", description: "Continue com sua conta Google" },
  { id: "github", label: "GitHub", description: "Continue com sua conta GitHub" },
];
