export type YouTubeVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
};

export type YouTubeSearchParams = {
  query: string;
  apiKey: string;
  maxResults?: number;
  fetchFn?: typeof fetch;
};

export type YouTubeApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};