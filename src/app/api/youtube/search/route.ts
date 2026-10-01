import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readUserGeoFromCookies } from "@/lib/bars/presence";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isCacheFresh } from "@/lib/youtube/cache";
import type { SongCacheStore } from "@/lib/youtube/cache";
import {
  defaultAppTokenProvider,
  resolveDevApiKeyFromEnv,
  resolveYouTubeApiKey,
} from "@/lib/youtube/credentials";
import { toFriendlyYouTubeError } from "@/lib/youtube/errors";
import { getHostAccessToken } from "@/lib/youtube/host-oauth";
import {
  MemoryRateLimiter,
  SEARCH_RATE_LIMIT_MAX,
  SEARCH_RATE_LIMIT_WINDOW_MS,
} from "@/lib/youtube/rate-limit";
import { searchYouTube } from "@/lib/youtube/search";
import type { YouTubeAuthMode } from "@/lib/youtube/types";
import {
  searchYouTubeForRoom,
  type MembershipStatus,
  type RoomSearchContext,
  type SearchOutcome,
} from "@/lib/youtube/service";
import type { YouTubeVideo } from "@/lib/youtube/types";

const limiter = new MemoryRateLimiter(SEARCH_RATE_LIMIT_WINDOW_MS, SEARCH_RATE_LIMIT_MAX);

async function getRoomContext(
  supabase: SupabaseClient,
  code: string
): Promise<RoomSearchContext | null> {
  // Duas leituras, de propósito, e a ordem importa.
  //
  // 1) com o client do USUÁRIO, para a RLS decidir: se a pessoa não for membro
  //    da sala, `rooms_public` devolve nada e a rota segue negando como antes.
  //    A autorização fica no banco, não num `if` do TypeScript.
  const { data: room } = await supabase
    .from("rooms_public")
    .select("id, host_id, bar_id")
    .eq("code", code)
    .maybeSingle();
  if (!room) return null;

  // 2) a chave de API só no SERVIDOR, com o client de service role. Ela deixou
  //    de ser legível pelo papel `authenticated` na migration `20260930038`
  //    (F1 da auditoria de RLS: qualquer participante aprovado extraía a chave do
  //    dono da sala). Uma RPC "só para membros" não resolveria — o participante
  //    chamaria a RPC pelo PostgREST e leria a chave do mesmo jeito. Aqui a chave
  //    é lida depois da autorização e nunca volta para o browser; é o mesmo
  //    padrão que `getRoomEntryState` já usa em `src/lib/bars/actions.ts`.
  const { data: secretRow } = await createAdmin()
    .from("rooms")
    .select("youtube_api_key")
    .eq("id", room.id)
    .maybeSingle();

  let bar: RoomSearchContext["bar"] = {
    latitude: null,
    longitude: null,
    raioPermitidoMetros: null,
  };
  if (room.bar_id) {
    const { data: barRow } = await supabase
      .from("bars")
      .select("latitude, longitude, raio_permitido_metros")
      .eq("id", room.bar_id)
      .maybeSingle();
    if (barRow) {
      bar = {
        latitude: barRow.latitude ?? null,
        longitude: barRow.longitude ?? null,
        raioPermitidoMetros: barRow.raio_permitido_metros ?? null,
      };
    }
  }

  return {
    roomId: room.id,
    hostId: room.host_id,
    youtubeApiKey: secretRow?.youtube_api_key ?? null,
    bar,
  };
}

function adminSongCache(admin: SupabaseClient): SongCacheStore {
  return {
    async get(queryNormalized) {
      const { data } = await admin
        .from("song_cache")
        .select("results, created_at")
        .eq("query_normalized", queryNormalized)
        .maybeSingle();
      if (!data || !isCacheFresh(data.created_at)) return null;
      return (data.results ?? []) as unknown as YouTubeVideo[];
    },
    async put(queryNormalized, results) {
      await admin.from("song_cache").upsert(
        { query_normalized: queryNormalized, results },
        { onConflict: "query_normalized" }
      );
    },
  };
}

function renderOutcome(outcome: SearchOutcome): NextResponse {
  if (outcome.ok) {
    const headers = { "Cache-Control": "no-store" };
    return NextResponse.json(outcome.data, { status: 200, headers });
  }

  const { failure } = outcome;
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (failure.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(failure.retryAfterSeconds);
  }

  const body: Record<string, unknown> = { error: failure.error };
  if (failure.code) body.code = failure.code;
  if (failure.geoRequired) body.geoRequired = true;

  let status = failure.status;
  let message = failure.error;
  if (status === 502 && failure.code === "API_ERROR") {
    message = toFriendlyYouTubeError(failure.error);
    body.error = message;
    status = 502;
  }

  return NextResponse.json(body, { status, headers });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Faça login para buscar músicas.", code: "UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const roomCode = request.nextUrl.searchParams.get("room")?.trim() ?? "";
  const rawQuery = request.nextUrl.searchParams.get("q") ?? "";
  const cookieStore = await cookies();
  const userCoords = readUserGeoFromCookies(cookieStore);
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const room = await getRoomContext(supabase, roomCode);
  const admin = createAdmin();

  const outcome = await searchYouTubeForRoom({
    roomCode,
    searchQuery: rawQuery,
    userId: user.id,
    clientIp,
    userCoords,
    getRoom: async () => room,
    getMembership: async (roomId, userId) => {
      if (room?.hostId === userId) return "host" satisfies MembershipStatus;
      const { data } = await supabase
        .from("room_members")
        .select("status")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();
      return (data?.status ?? "none") as MembershipStatus;
    },
    consumeRateLimit: (key) => limiter.consume(key),
    cache: adminSongCache(admin),
    resolveCredential: async () => {
      const hostToken = room
        ? await getHostAccessToken({
            hostId: room.hostId,
            store: {
              getRefreshToken: async (hostId) => {
                const { data } = await admin
                  .from("youtube_oauth_tokens")
                  .select("refresh_token")
                  .eq("host_id", hostId)
                  .maybeSingle();
                return data?.refresh_token ?? null;
              },
            },
          })
        : null;
      return resolveYouTubeApiKey({
        roomKey: room?.youtubeApiKey ?? null,
        hostToken,
        appToken: defaultAppTokenProvider(),
        devApiKey: resolveDevApiKeyFromEnv(),
      });
    },
    runSearch: async ({ query, credential }) => {
      const authMode: YouTubeAuthMode =
        credential.source === "app" || credential.source === "host" ? "bearer" : "key";
      return searchYouTube({ query, apiKey: credential.key, authMode, maxResults: 10 });
    },
  });

  return renderOutcome(outcome);
}