import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  console.log("=== API /auth/redirect ===");
  console.log("Code:", code);
  console.log("Next:", next);

  if (!code) {
    console.log("No code, redirecting to login");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const redirectUrl = new URL(next, request.url);
  redirectUrl.searchParams.set("code", code);

  console.log("Redirecting to:", redirectUrl.toString());

  return NextResponse.redirect(redirectUrl);
}
