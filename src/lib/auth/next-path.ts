/**
 * `next` do fluxo de login: caminho interno ou nada.
 *
 * A regra já existia na mão dentro de `src/app/auth/callback/route.ts`, mas o
 * proxy e o formulário de login precisavam da mesma coisa para o outro sentido:
 * levar o convidado que escaneou o QR para `/entrar?code=…` de volta para lá
 * depois do "Continuar sem login". Três cópias da mesma validação é como uma
 * delas vira open redirect — então ela mora aqui.
 *
 * Recusa o que não é caminho interno: `//evil.com` e `https://evil.com` passam
 * a ser resolvidos pelo browser como URL absoluta (protocol-relative), e é
 * assim que o `next` sai do domínio.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string | null
): string | null {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  return value;
}

/**
 * Divide um `next` validado em pathname e query, para quem monta o redirect com
 * `NextResponse.redirect`: jogar `/entrar?code=X` inteiro no `pathname` faria o
 * `?` virar `%3F` e a pessoa cairia numa rota que não existe.
 */
export function splitNextPath(next: string): { pathname: string; search: string } {
  const separator = next.indexOf("?");
  if (separator === -1) return { pathname: next, search: "" };
  return { pathname: next.slice(0, separator), search: next.slice(separator) };
}
