import type { YouTubeApiErrorPayload } from "@/lib/youtube/types";

export class YouTubeApiError extends Error {
  readonly code: number | null;
  readonly reason: string | null;

  constructor(message: string, payload: YouTubeApiErrorPayload, httpStatus: number | null) {
    super(message);
    this.name = "YouTubeApiError";
    this.code = payload.error?.code ?? httpStatus;
    this.reason = payload.error?.errors?.[0]?.reason ?? payload.error?.message ?? null;
  }
}

export function toFriendlyYouTubeError(message: string): string {
  const lower = message.toLowerCase();
  if (/quota|dailyLimitExceeded|rateLimitExceeded/.test(lower)) {
    return "A cota de buscas no YouTube deste bar acabou por hoje. Tente de novo amanhã.";
  }
  if (/keyInvalid|forbidden|refererRestriction|ipRefererBlocked/.test(lower)) {
    return "A chave do YouTube deste bar não é válida para esta busca.";
  }
  return "Não foi possível buscar no YouTube agora. Tente de novo em instantes.";
}