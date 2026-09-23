import { randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { normalizeRoomCode } from "@/lib/rooms/utils";

export const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const YOUTUBE_OAUTH_STATE_COOKIE = "kf-yt-oauth";

export function buildOauthUrlFrom(request: NextRequest, stateValue: string): URL {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const redirectUri = `${oauthBaseUrl(request)}/auth/youtube/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", encodeURIComponent(stateValue));
  return url;
}

export function oauthBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;
}

export function makeOauthState(roomCode: string | undefined): string {
  const nonce = randomBytes(16).toString("hex");
  return JSON.stringify({ nonce, room: roomCode ? normalizeRoomCode(roomCode) : undefined });
}

export type OauthStatePayload = {
  nonce: string;
  room?: string;
};

export function parseOauthState(raw: string | null): OauthStatePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OauthStatePayload;
    if (parsed && typeof parsed.nonce === "string" && parsed.nonce.length > 0) return parsed;
  } catch {
    return null;
  }
  return null;
}

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
  response.cookies.set(YOUTUBE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}