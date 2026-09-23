import type { Provider } from "@supabase/supabase-js";

/**
 * Provedores de login OAuth suportados pela UI.
 * Ordem = prioridade da interface (Spotify e GitHub primeiro).
 *
 * `disabled`: o provedor está construído (credenciais no Supabase) mas o login
 * não está disponível no momento — o botão é renderizado desabilitado.
 * Motivos atuais: Spotify exige Premium para a Web API; Discord/Facebook/X
 * aguardam criação dos apps OAuth externos (app review para produção).
 */
export const AUTH_PROVIDER_IDS = [
  "spotify",
  "github",
  "google",
  "discord",
  "facebook",
  "x",
] as const;

export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export type AuthProviderConfig = {
  id: Provider;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
};

export const AUTH_PROVIDERS: AuthProviderConfig[] = [
  {
    id: "spotify",
    label: "Spotify",
    description: "Entre com sua conta de usuário Spotify",
    disabled: true,
    disabledReason:
      "Web API exige Spotify Premium — aguardando conta habilitada para voltar.",
  },
  { id: "github", label: "GitHub", description: "Continue com sua conta GitHub" },
  { id: "google", label: "Google", description: "Continue com sua conta Google" },
  {
    id: "discord",
    label: "Discord",
    description: "Continue com sua conta Discord",
    disabled: true,
    disabledReason: "Credenciais ainda não configuradas no Supabase.",
  },
  {
    id: "facebook",
    label: "Facebook",
    description: "Continue com sua conta Facebook (exige app review p/ produção)",
    disabled: true,
    disabledReason: "Credenciais ainda não configuradas no Supabase.",
  },
  {
    id: "x",
    label: "X",
    description: "Continue com sua conta X",
    disabled: true,
    disabledReason: "Credenciais ainda não configuradas no Supabase.",
  },
];
