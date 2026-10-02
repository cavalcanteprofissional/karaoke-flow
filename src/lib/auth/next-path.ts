/**
 * `next` do fluxo de login: caminho interno ou nada.
 *
 * A regra já existia na mão dentro de `src/app/auth/callback/route.ts`, mas o
 * proxy e o formulário de login precisavam da mesma coisa para o outro sentido:
 * levar o convidado que escaneou o QR para `/entrar?code=…` de volta para lá
 * depois do "Continuar sem login". Três cópias da mesma validação é como uma
 * delas vira open redirect — então ela mora aqui.
 *
 * O critério não é "começa com `/`", é **sobrevive à normalização do parser de
 * URL** (WHATWG), que é o que o browser faz antes de navegar:
 *
 *   - `//evil.com` → URL absoluta (protocol-relative).
 *   - `/\evil.com` → **o `\` vira `/`** no estado de path, e o resultado é o
 *     mesmo `//evil.com`. Chega escrito assim por causa de `%5C` numa query.
 *   - `/%09/evil.com` → `searchParams.get` devolve um **tab real**; o parser
 *     **apaga** tab/LF/CR do input e sobra `//evil.com`.
 *
 * Por isso a validação recusa barra invertida e caracteres de controle, e não
 * só o `//` da primeira posição. No proxy e no callback o estrago era inofensivo
 * (ambos montam a URL com o host fixo do app), mas `login-form.tsx` faz
 * `router.replace(nextPath)`, e o `resolveHref` do Next resolve com
 * `new URL(href, location.href)` — aí a variante com `\` ou tab virava um
 * redirecionamento para fora do domínio **depois do login**.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: string | null
): string | null {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  // Cobre `/\evil.com`: o parser troca `\` por `/` e o caminho vira absoluto.
  if (value.includes("\\")) return fallback;
  // Tab/LF/CR são apagados pelo parser; nenhum outro caractere de controle tem
  // lugar num caminho de URL.
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;
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
