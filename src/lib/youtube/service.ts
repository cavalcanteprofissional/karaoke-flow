import type { BarLocation } from "@/lib/bars/geo";
import type { RateLimitDecision } from "@/lib/youtube/rate-limit";
import type { ResolvedApiKey } from "@/lib/youtube/credentials";
import type { SongCacheStore } from "@/lib/youtube/cache";
import type { YouTubeVideo } from "@/lib/youtube/types";
import type { GeoCoordinates } from "@/lib/consent/geo";
import { normalizeQuery } from "@/lib/youtube/cache";
import { PRESENCE_ERROR_GEO, checkPresence } from "@/lib/bars/geo";

export type MembershipStatus = "host" | "approved" | "pending" | "none";

export type RoomSearchContext = {
  roomId: string;
  hostId: string;
  youtubeApiKey: string | null;
  bar: BarLocation;
};

export type SearchPorts = {
  roomCode: string;
  searchQuery: string;
  userId: string;
  clientIp: string;
  userCoords: GeoCoordinates | null;
  getRoom: (code: string) => Promise<RoomSearchContext | null>;
  getMembership: (roomId: string, userId: string) => Promise<MembershipStatus>;
  consumeRateLimit: (key: string) => RateLimitDecision;
  cache: SongCacheStore;
  resolveCredential: () => Promise<ResolvedApiKey | null>;
  runSearch: (params: {
    query: string;
    apiKey: string;
  }) => Promise<YouTubeVideo[]>;
};

export type SearchFailure = {
  status: 400 | 401 | 403 | 404 | 429 | 502;
  error: string;
  retryAfterSeconds?: number;
  geoRequired?: boolean;
  code?: string;
};

export type SearchSuccess = {
  results: YouTubeVideo[];
  cached: boolean;
  source: ResolvedApiKey["source"] | null;
};

export type SearchOutcome = { ok: true; data: SearchSuccess } | { ok: false; failure: SearchFailure };

const EMPTY_QUERY: SearchFailure = { status: 400, error: "Digite algo para buscar.", code: "EMPTY_QUERY" };

/**
 * Orquestra a busca de músicas da sala (spec §4 Fase 4): autenticação/membro,
 * rate limit, gate de presença física, cache compartilhado e resolução de
 * credencial (chave do bar → OAuth do app → chave de dev) — tudo com portas
 * injetáveis para testes sem rede nem banco.
 */
export async function searchYouTubeForRoom(
  ports: SearchPorts
): Promise<SearchOutcome> {
  const query = normalizeQuery(ports.searchQuery);
  if (!query) return { ok: false, failure: EMPTY_QUERY };

  const limit = await Promise.resolve(
    ports.consumeRateLimit(`${ports.clientIp}:${ports.userId}`)
  );
  if (!limit.allowed) {
    return {
      ok: false,
      failure: {
        status: 429,
        error: "Você buscou demais. Espere um pouco e tente de novo.",
        retryAfterSeconds: Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000)),
        code: "RATE_LIMITED",
      },
    };
  }

  const room = await ports.getRoom(ports.roomCode);
  if (!room) {
    return { ok: false, failure: { status: 404, error: "Sala não encontrada.", code: "ROOM_NOT_FOUND" } };
  }

  const membership = await ports.getMembership(room.roomId, ports.userId);
  if (membership === "none" || membership === "pending") {
    return {
      ok: false,
      failure: {
        status: 403,
        error:
          membership === "pending"
            ? "Você ainda não foi aprovado nesta sala."
            : "Você não é membro desta sala.",
        code: membership === "pending" ? "PENDING" : "NOT_MEMBER",
      },
    };
  }

  if (membership !== "host") {
    const presence = checkPresence({
      isHost: false,
      userCoords: ports.userCoords,
      barCoords:
        room.bar.latitude !== null && room.bar.longitude !== null
          ? { latitude: room.bar.latitude, longitude: room.bar.longitude }
          : null,
      radiusMeters: room.bar.raioPermitidoMetros,
    });
    if (!presence.ok) {
      return {
        ok: false,
        failure: {
          status: 403,
          error: presence.error,
          geoRequired: true,
          code: presence.reason === "geo-unavailable" ? "GEO_UNAVAILABLE" : "OUTSIDE_BAR",
        },
      };
    }
  }

  const cached = await ports.cache.get(query);
  if (cached) {
    return { ok: true, data: { results: cached, cached: true, source: null } };
  }

  const credential = await ports.resolveCredential();
  if (!credential) {
    return {
      ok: false,
      failure: {
        status: 502,
        error: "Nenhuma credencial do YouTube configurada para este bar.",
        code: "NO_CREDENTIAL",
      },
    };
  }

  try {
    const results = await ports.runSearch({ query, apiKey: credential.key });
    await ports.cache.put(query, results);
    return { ok: true, data: { results, cached: false, source: credential.source } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failure: {
        status: 502,
        error: reason,
        code: "API_ERROR",
      },
    };
  }
}

export function presenceErrorForGeo(): string {
  return PRESENCE_ERROR_GEO;
}