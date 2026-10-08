import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { safeNextPath, splitNextPath } from "@/lib/auth/next-path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// `/bar` (Fase 17): a tela de configuração do bar é sessão + dono do bar,
// igual às de sala. Sem `PROTECTED_PREFIXES` o anônimo chegava até a página.
const PROTECTED_PREFIXES = ["/dashboard", "/salas", "/entrar", "/bar"];
const AUTH_PREFIXES = ["/login"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAnonymous = user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true;

  const { pathname, search } = request.nextUrl;

  if (!user && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // O `?code=`/`?bar=` do QR precisa sobreviver ao login: quem escaneia pela
    // primeira vez cai aqui sem sessão, e sem este `next` voltaria para `/entrar`
    // sem o código — obriga a escanear o QR de novo. A query original é *movida*
    // para dentro do `next` (e não copiada), senão o `/login` ainda carregaria
    // `?code=…` junto de `?next=…`.
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/" || matchesPrefix(pathname, AUTH_PREFIXES))) {
    const url = request.nextUrl.clone();
    // Quem já tem sessão e chega no `/login` (ou na raiz) segue para onde queria
    // estar, quando o proxy é quem mandou para cá.
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), null);
    if (next) {
      const target = splitNextPath(next);
      url.pathname = target.pathname;
      url.search = target.search;
      return NextResponse.redirect(url);
    }
    url.pathname = isAnonymous ? "/entrar" : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Visitante anônimo não precisa do painel; leva ao fluxo de entrada.
  if (user && isAnonymous && matchesPrefix(pathname, ["/dashboard"])) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.headers.set("Cache-Control", "private, no-store");

  return response;
}

export const config = {
  matcher: [
    /**
     * `/api` ficou de fora na Fase 8f, e o motivo é custo duplicado: o proxy
     * roda em TODA requisição casada e chama `supabase.auth.getUser()` — que é
     * uma ida ao Supabase Auth, não uma leitura de cookie. A rota
     * `/api/youtube/search` já chama `getUser()` para a mesma sessão, logo cada
     * busca pagava a validação duas vezes. Em busca com debounce de 500 ms e
     * 50–100 pessoas no bar, isso é latência somada em cima de latência.
     *
     * Nenhuma regra deste arquivo vale para `/api`: as prefixes são
     * `/dashboard`, `/salas`, `/entrar` e `/login`, e cada rota de API faz a
     * própria autenticação (`createClient()` + `getUser()`) e devolve 401
     * sozinha. O que se perde é o `Cache-Control: private, no-store` que a linha
     * 81 aplica — e as rotas de API já o enviam explicitamente, porque resposta
     * de API sem `no-store` é cache compartilhável por CDN.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
