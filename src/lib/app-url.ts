/**
 * Base pública do app para montar URLs de QR.
 *
 * Ordem: origem real do cliente → `NEXT_PUBLIC_APP_URL` → localhost de
 * desenvolvimento.
 *
 * A origem real vem primeiro de propósito. `NEXT_PUBLIC_APP_URL` é inlinada no
 * bundle em **build time**, então num deploy de preview da Vercel — que tem URL
 * própria — ela continua apontando para a produção, e o QR da TV manda o
 * visitante para o app errado. O host que a pessoa está vendo é o host que o QR
 * precisa codificar. A env continua como fallback: ela é o que salva o
 * servidor (RSC, `generateMetadata`), que não tem `window`.
 */
export function resolveAppUrl(appUrl?: string | null): string {
  const explicit = appUrl?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  if (typeof window !== "undefined" && window.location?.origin) {
    return stripTrailingSlash(window.location.origin);
  }

  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return stripTrailingSlash(env);

  return "http://localhost:3000";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
