/**
 * Token de acesso OAuth do APP (conta do desenvolvedor) para a YouTube Data API.
 * Refresca `YOUTUBE_APP_REFRESH_TOKEN` (gerado por scripts/youtube-app-oauth.mjs)
 * e cacheia o access token em memória com tolerância de expiração.
 * Server-side apenas — nunca importar em componente client.
 */
const TOKEN_RESERVE_SECONDS = 60 * 5;

let cachedToken: { value: string; expiresAt: number } | null = null;

export function clearCachedAppToken(): void {
  cachedToken = null;
}

async function refreshTokenFlow(
  credentials: { clientId: string | undefined; clientSecret: string | undefined; refreshToken: string },
  fetcher: typeof fetch
): Promise<string | null> {
  const { clientId, clientSecret, refreshToken } = credentials;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  try {
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function refreshAppAccessToken(
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  const token = await refreshTokenFlow(
    {
      clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
      refreshToken: process.env.YOUTUBE_APP_REFRESH_TOKEN ?? "",
    },
    fetcher
  );
  if (!token) return null;
  cachedToken = {
    value: token,
    expiresAt: Date.now() + (3600 - TOKEN_RESERVE_SECONDS) * 1000,
  };
  return token;
}

export type AuthorizationCodeResult = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresInSeconds: number | null;
};

/** Troca um authorization code (callback do per-host) por tokens. */
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
  fetcher: typeof fetch = fetch
): Promise<AuthorizationCodeResult> {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { accessToken: null, refreshToken: null, expiresInSeconds: null };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  let response: Response;
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { accessToken: null, refreshToken: null, expiresInSeconds: null };
  }
  if (!response.ok) return { accessToken: null, refreshToken: null, expiresInSeconds: null };

  try {
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: data.access_token ?? null,
      refreshToken: data.refresh_token ?? null,
      expiresInSeconds: Number.isFinite(data.expires_in) ? (data.expires_in as number) : null,
    };
  } catch {
    return { accessToken: null, refreshToken: null, expiresInSeconds: null };
  }
}

/** Refresca o access token do HOST a partir do refresh_token armazenado (youtube_oauth_tokens). */
export async function refreshHostAccessToken(
  refreshToken: string,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  return refreshTokenFlow(
    {
      clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
      refreshToken,
    },
    fetcher
  );
}

export async function getAppAccessToken(
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return refreshAppAccessToken(fetcher);
}

/** Revoga um refresh token na Google (oauth2.googleapis.com/revoke). */
export async function revokeGoogleToken(
  refreshToken: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const response = await fetcher(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return response.ok;
  } catch {
    return false;
  }
}