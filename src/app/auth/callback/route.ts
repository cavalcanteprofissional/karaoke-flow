import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const errorParam = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") || "/dashboard";

  console.log("=== SERVER-SIDE AUTH CALLBACK ===");
  console.log("Code:", !!code);
  console.log("Error:", errorParam);

  if (errorParam) {
    console.error("OAuth Error:", errorParam, errorDescription);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || errorParam)}`, request.url)
    );
  }

  if (!code) {
    console.log("No code in URL, redirecting to login");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Handle cookie errors
            }
          },
        },
      }
    );

    console.log("Exchanging code for session...");
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Exchange error:", error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    if (data.session?.user) {
      console.log("Session created for user:", data.session.user.id);
      return NextResponse.redirect(new URL(next, request.url));
    } else {
      console.log("No session after exchange");
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch (err) {
    console.error("Catch error:", err);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
