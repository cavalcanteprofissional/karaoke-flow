const OAUTH_URL = "https://oauth2.googleapis.com";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface YouTubeOAuthConfig {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export function getOAuthConfig(): YouTubeOAuthConfig | null {
  const client_id = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const client_secret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const redirect_uri = `${process.env.NEXT_PUBLIC_APP_URL}/api/youtube/callback`;

  if (!client_id || !client_secret) {
    return null;
  }

  return { client_id, client_secret, redirect_uri };
}

export function getAuthUrl(): string | null {
  const config = getOAuthConfig();
  if (!config) return null;

  const scopes = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.readonly",
  ];

  const params = new URLSearchParams({
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function getTokens(code: string): Promise<YouTubeOAuthTokens | null> {
  const config = getOAuthConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${OAUTH_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: config.client_id,
        client_secret: config.client_secret,
        redirect_uri: config.redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function refreshTokens(refresh_token: string): Promise<YouTubeOAuthTokens | null> {
  const config = getOAuthConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${OAUTH_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token,
        client_id: config.client_id,
        client_secret: config.client_secret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getYouTubePlaylist(accessToken: string) {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE}/playlists?part=snippet,status&mine=true&maxResults=50`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) return { playlists: [], error: "Failed to fetch playlists" };
    const data = await response.json();
    return { playlists: data.items || [], error: null };
  } catch (error) {
    return {
      playlists: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
