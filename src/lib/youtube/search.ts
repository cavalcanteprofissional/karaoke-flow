import { YouTubeApiError } from "@/lib/youtube/errors";
import type { YouTubeApiErrorPayload, YouTubeSearchParams, YouTubeVideo } from "@/lib/youtube/types";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const DURATION_BATCH_SIZE = 50;

type SearchSnippet = {
  title?: string;
  channelTitle?: string;
  thumbnails?: { medium?: { url?: string } };
};

type SearchResponse = {
  items?: Array<{ id?: { videoId?: string }; snippet?: SearchSnippet }>;
};

type VideosResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: { duration?: string };
  }>;
};

/**
 * Busca vídeos de karaokê na YouTube Data API v3 (servidor).
 * `safeSearch=strict` + `videoEmbeddable=true` (spec §13: moderação de conteúdo
 * e vídeos reproduzíveis no player). Segunda chamada em lotes para enriquecer
 * com a duração (ISO 8601 -> segundos). `fetchFn` injetável para testes.
 */
export async function searchYouTube(
  params: YouTubeSearchParams
): Promise<YouTubeVideo[]> {
  const { apiKey, fetchFn = fetch } = params;
  const query = params.query.trim();
  if (!query) return [];

  const maxResults = Math.min(Math.max(1, params.maxResults ?? 10), 25);

  const searchUrl = new URL(`${API_BASE}/search`);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("safeSearch", "strict");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("key", apiKey);

  const searchBody = (await requestJson<SearchResponse>(searchUrl.toString(), fetchFn)).body;

  const items = searchBody?.items ?? [];
  if (items.length === 0) return [];

  const found: Array<{ videoId: string; title: string; thumbnailUrl: string | null; channelTitle: string | null }> =
    [];

  for (const item of items) {
    const videoId = item.id?.videoId;
    const title = item.snippet?.title;
    if (!videoId || !title) continue;
    found.push({
      videoId,
      title,
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
      channelTitle: item.snippet?.channelTitle ?? null,
    });
  }

  if (found.length === 0) return [];

  const durations = await fetchDurations(found.map((f) => f.videoId), apiKey, fetchFn);

  return found.map((f) => ({
    ...f,
    durationSeconds: durations.get(f.videoId) ?? null,
  }));
}

async function fetchDurations(
  videoIds: string[],
  apiKey: string,
  fetchFn: typeof fetch
): Promise<Map<string, number>> {
  const durations = new Map<string, number>();

  for (let i = 0; i < videoIds.length; i += DURATION_BATCH_SIZE) {
    const batch = videoIds.slice(i, i + DURATION_BATCH_SIZE);
    const videosUrl = new URL(`${API_BASE}/videos`);
    videosUrl.searchParams.set("part", "contentDetails");
    videosUrl.searchParams.set("id", batch.join(","));
    videosUrl.searchParams.set("key", apiKey);

    const { body } = await requestJson<VideosResponse>(videosUrl.toString(), fetchFn);
    for (const item of body.items ?? []) {
      if (!item.id) continue;
      const seconds = parseIso8601Duration(item.contentDetails?.duration);
      if (seconds !== null) durations.set(item.id, seconds);
    }
  }

  return durations;
}

async function requestJson<T>(
  url: string,
  fetchFn: typeof fetch
): Promise<{ status: number; body: T }> {
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch {
    throw new YouTubeApiError("Falha de rede ao falar com o YouTube.", {}, null);
  }

  let payload: YouTubeApiErrorPayload = {};
  try {
    payload = (await response.json()) as YouTubeApiErrorPayload;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const details = typeof payload?.error?.message === "string" ? payload.error.message : "";
    throw new YouTubeApiError(details, payload, response.status);
  }

  return { status: response.status, body: payload as unknown as T };
}

/**
 * Converte duração ISO 8601 (PT1H2M3S) da YouTube para segundos.
 * Retorna null quando o formato não é válido.
 */
export function parseIso8601Duration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}