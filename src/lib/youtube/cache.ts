import type { YouTubeVideo } from "@/lib/youtube/types";

export const SONG_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

export const CACHE_BUCKET = 128;

/**
 * Normaliza a consulta para lookup no cache compartilhado (spec §12): minúsculas,
 * espaços colapsados, sem acentos, palavras únicas em ordem alfabética (bucket
 * por prefixo) para reaproveitar resultados entre buscas aproximadas da mesma
 * sala (ex: "kate bush" e "bush kate" compartilham a mesma chave).
 */
export function normalizeQuery(query: string): string {
  const words = [
    ...new Set(
      query
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
    ),
  ].sort();
  return words.join(" ").slice(0, CACHE_BUCKET);
}

export function isCacheFresh(createdAt: string, now: number = Date.now()): boolean {
  const ageSeconds = (now - Date.parse(createdAt)) / 1000;
  return Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds <= SONG_CACHE_TTL_SECONDS;
}

export type SongCacheStore = {
  get: (queryNormalized: string) => Promise<YouTubeVideo[] | null>;
  put: (queryNormalized: string, results: YouTubeVideo[]) => Promise<void>;
};