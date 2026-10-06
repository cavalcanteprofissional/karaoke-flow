import { randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";

import { normalizeRoomCode } from "@/lib/rooms/utils";

export const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const YOUTUBE_OAUTH_STATE_COOKIE = "kf-yt-oauth";

/**
 * Base URL usada no `redirect_uri` do OAuth do YouTube.
 *
 * A ordem é env PRIMEIRO, e isso é deliberado ao contrário do que parece certo:
 * o Google exige que o `redirect_uri` case caractere a caractere com o que está
 * registrado no console. Registrar `https://seudominio.com.br/...` e mandar o
 * host do deploy de preview (`karaoke-xyz.vercel.app`) faz o Google recusar com
 * `redirect_uri_mismatch` — sem chance de bypass e sem mensagem útil. Então a env
 * é a fonte da verdade, e o host da requisição é o fallback para o dev local.
 *
 * O que o diagnóstico ganhou na Fase 8f: o caso "env ausente na Vercel" é
 * invisível sem um log, e é exatamente o que produz o erro de OAuth que ninguém
 * sabe explicar. `logMissingAppUrl` avisa uma vez, no servidor.
 */
export function oauthBaseUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_ENV) {
    logMissingAppUrl();
  }
  return request.nextUrl.origin;
}

let warnedMissingAppUrl = false;

function logMissingAppUrl(): void {
  if (warnedMissingAppUrl) return;
  warnedMissingAppUrl = true;
  console.warn(
    JSON.stringify({
      event: "youtube_oauth_missing_app_url",
      message:
        "NEXT_PUBLIC_APP_URL ausente em ambiente Vercel: o redirect_uri do OAuth do YouTube está sendo montado com o host da requisição. Se o Google recusar com redirect_uri_mismatch, registre o host do deploy em NEXT_PUBLIC_APP_URL.",
    })
  );
}

/** Só para teste: permite rearmar o aviso de env ausente. */
export function resetMissingAppUrlWarning(): void {
  warnedMissingAppUrl = false;
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
  url.searchParams.set("state", stateValue);
  return url;
}