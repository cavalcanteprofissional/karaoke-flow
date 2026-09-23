import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { exchangeAuthorizationCode } from "@/lib/youtube/app-oauth";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  oauthBaseUrl,
  parseOauthState,
  YOUTUBE_OAUTH_STATE_COOKIE,
} from "@/app/auth/youtube/authorize/route";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams;
  const oauthError = query.get("error");
  if (oauthError) {
    return redirectWithError(request, "denied");
  }

  const code = query.get("code");
  const rawState = query.get("state");
  const stateCookie = request.cookies.get(YOUTUBE_OAUTH_STATE_COOKIE)?.value ?? null;
  if (!code || !rawState) {
    return redirectWithError(request, "missing-code");
  }

  const expected = parseOauthState(stateCookie);
  const actual = parseOauthState(rawState);
  if (!expected || !actual || expected.nonce !== actual.nonce) {
    return redirectWithError(request, "state-mismatch");
  }

  const tokens = await exchangeAuthorizationCode(code, `${oauthBaseUrl(request)}/auth/youtube/callback`);
  if (!tokens.refreshToken) {
    return redirectWithError(request, "no-refresh-token");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithError(request, "not-authenticated");
  }

  const admin = createAdmin();
  const { error } = await admin.from("youtube_oauth_tokens").upsert(
    {
      host_id: user.id,
      refresh_token: tokens.refreshToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "host_id" }
  );
  if (error) {
    return redirectWithError(request, "store-failed");
  }

  const target = actual.room ? `/salas/${actual.room}` : "/dashboard";
  const response = NextResponse.redirect(new URL(target, oauthBaseUrl(request)));
  response.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
  return response;
}

function redirectWithError(request: NextRequest, reason: string): NextResponse {
  const target = `/dashboard?youtube=error&reason=${encodeURIComponent(reason)}`;
  const response = NextResponse.redirect(new URL(target, oauthBaseUrl(request)));
  response.cookies.delete(YOUTUBE_OAUTH_STATE_COOKIE);
  return response;
}