export type YouTubeVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
};

export type YouTubeAuthMode = "key" | "bearer";

export type YouTubeSearchParams = {
  query: string;
  apiKey: string;
  maxResults?: number;
  /** key = `?key=` (API key). bearer = `Authorization: Bearer` (OAuth app/host). */
  authMode?: YouTubeAuthMode;
  /**
   * Filtro de conteúdo explícito (`safeSearch`). `strict` (padrão) esconde
   * conteúdo adulto; `none` desliga o filtro — escolha do host em
   * `rooms.youtube_safe_search` (item 6). `moderate` existe na API do Google,
   * mas o produto só expõe ligado/desligado.
   */
  safeSearch?: "strict" | "none";
  fetchFn?: typeof fetch;
};

export type YouTubeApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};