import { getAppAccessToken } from "@/lib/youtube/app-oauth";

export type ApiKeySource = "room" | "host" | "app" | "dev";

export type ResolvedApiKey = {
  key: string;
  source: ApiKeySource;
};

/**
 * Resolve a chave da YouTube Data API (spec §12 escalabilidade):
 * 1) chave manual do bar (`rooms.youtube_api_key`);
 * 2) token OAuth do HOST (conta Google do dono, via `youtube_oauth_tokens`);
 * 3) OAuth do app (conta dev, via refresh token);
 * 4) chave de desenvolvimento (`YOUTUBE_API_KEY`) — só setada em dev.
 * Retorna null quando não há credencial disponível.
 */
export async function resolveYouTubeApiKey(params: {
  roomKey: string | null;
  hostToken?: string | null;
  appToken?: () => Promise<string | null>;
  devApiKey?: string | null;
}): Promise<ResolvedApiKey | null> {
  const { roomKey, hostToken, appToken, devApiKey } = params;

  const trimmedRoom = roomKey?.trim();
  if (trimmedRoom) return { key: trimmedRoom, source: "room" };

  const trimmedHost = hostToken?.trim();
  if (trimmedHost) return { key: trimmedHost, source: "host" };

  if (appToken) {
    const token = await appToken();
    if (token) return { key: token, source: "app" };
  }

  const trimmedDev = devApiKey?.trim();
  if (trimmedDev) return { key: trimmedDev, source: "dev" };

  return null;
}

export function resolveDevApiKeyFromEnv(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

export function defaultAppTokenProvider(): () => Promise<string | null> {
  return () => getAppAccessToken();
}