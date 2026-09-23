import { refreshHostAccessToken } from "@/lib/youtube/app-oauth";

export type HostTokenStore = {
  getRefreshToken: (hostId: string) => Promise<string | null>;
};

/**
 * Obtém um access token OAuth do host para a YouTube Data API, refinando o
 * refresh_token armazenado em `youtube_oauth_tokens` (apenas service role).
 * Retorna null quando o host nunca conectou a conta.
 */
export async function getHostAccessToken(params: {
  hostId: string;
  store: HostTokenStore;
  refresher?: (refreshToken: string) => Promise<string | null>;
}): Promise<string | null> {
  const refreshToken = await params.store.getRefreshToken(params.hostId);
  if (!refreshToken) return null;
  const refresher = params.refresher ?? refreshHostAccessToken;
  return refresher(refreshToken);
}