import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

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

  if (errorParam) {
    console.log("OAuth error detected, redirecting to login");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", errorDescription || errorParam);
    return NextResponse.redirect(url);
  }

  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/auth/callback",
    "/auth/logout",
    "/debug",
    "/hybridaction",
  ];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  const isAdminRoute = pathname.startsWith("/administracao");

  let user = null;
  if (!isPublicRoute || pathname === "/") {
    const { data, error } = await supabase.auth.getUser();
    if (error && !isPublicRoute) {
      console.log("[Middleware] Auth error:", error.message);
    }
    user = data?.user || null;
  }

  if (!user && !isPublicRoute) {
    console.log("[Middleware] No user, redirecting to login");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isPublicRoute && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

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