import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // DIAGNÓSTICO: Adicionar timeout para evitar bloqueios
  let user = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Middleware timeout")), 5000);
    });

    const authPromise = supabase.auth.getUser();
    
    const result = await Promise.race([authPromise, timeoutPromise]);
    user = result.data?.user || null;
  } catch (error) {
    console.error("[Middleware] Auth error:", error);
    // Continuar sem usuário em caso de erro
  }

  const { pathname } = request.nextUrl;

  // Rotas públicas (não requerem autenticação)
  // TEMPORÁRIO: Adicionado /dashboard para diagnóstico
  const publicRoutes = ["/", "/login", "/register", "/dashboard"];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Rotas de admin
  const isAdminRoute = pathname.startsWith("/admin");

  // Redirecionar para login se não autenticado e rota protegida
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Se autenticado, redirecionar de rotas públicas para dashboard
  if (user && isPublicRoute && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Verificar role de admin para rotas admin
  if (user && isAdminRoute) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    } catch (error) {
      console.error("[Middleware] Admin check error:", error);
    }
  }

  return supabaseResponse;
}
