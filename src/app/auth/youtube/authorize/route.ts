import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildOauthUrlFrom,
  makeOauthState,
  YOUTUBE_OAUTH_STATE_COOKIE,
} from "@/app/auth/youtube/oauth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const room = request.nextUrl.searchParams.get("room")?.trim() ?? "";

  if (!process.env.YOUTUBE_OAUTH_CLIENT_ID) {
    return NextResponse.json(
      { error: "OAuth do YouTube não configurado (YOUTUBE_OAUTH_CLIENT_ID)." },
      { status: 500 }
    );
  }

  const state = makeOauthState(room || undefined);
  const url = buildOauthUrlFrom(request, state);
  const response = NextResponse.redirect(url.toString(), { status: 302 });
  const hostname = request.nextUrl.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  response.cookies.set(YOUTUBE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !isLocal,
    maxAge: 600,
    path: "/",
  });
  return response;
}