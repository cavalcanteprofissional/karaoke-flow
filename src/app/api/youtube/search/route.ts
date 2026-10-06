import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readUserGeoFromCookies } from "@/lib/bars/presence";
import { isDevAccount } from "@/lib/dev";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isCacheFresh } from "@/lib/youtube/cache";
import type { SongCacheStore } from "@/lib/youtube/cache";
import {
  defaultAppTokenProvider,
  resolveDevApiKeyFromEnv,
  resolveYouTubeApiKey,
} from "@/lib/youtube/credentials";
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
  type CredentialPolicy,
  type MembershipStatus,
  type RoomSearchContext,
  type SearchOutcome,
} from "@/lib/youtube/service";
import type { YouTubeVideo } from "@/lib/youtube/types";

const limiter = new MemoryRateLimiter(SEARCH_RATE_LIMIT_WINDOW_MS, SEARCH_RATE_LIMIT_MAX);

async function getRoomContext(
  supabase: SupabaseClient,
  admin: SupabaseClient,
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
  const { data: secretRow } = await admin
    .from("rooms")
    .select("youtube_api_key")
    .eq("id", room.id)
    .maybeSingle();

  let bar: RoomSearchContext["bar"] = {
    latitude: null,
    longitude: null,
    raioPermitidoMetros: null,
  };
  // A política e o pool são decisão do dono do BAR, não da sala: uma bar tem
  // várias salas e a escolha vale para todas. Lida com service role porque
  // `youtube_credential_pools` é uma tabela de segredo (RLS ligado e sem
  // policy, migration `20261005000043`) — via Data API ela é invisível.
  let policy: CredentialPolicy = "own_only";
  let poolKey: string | null = null;
  if (room.bar_id) {
    // A política é escolha pública do dono do bar (uma coluna de `bars`), então
    // vem pelo client do usuário. `youtube_pool_id` também — o RLS de `bars`
    // segue igual; o que é segredo é a chave dentro do pool, e essa vem no
    // bloco seguinte, por service role.
    const { data: barRow } = await supabase
      .from("bars")
      .select("latitude, longitude, raio_permitido_metros, youtube_credential_policy, youtube_pool_id")
      .eq("id", room.bar_id)
      .maybeSingle();
    if (barRow) {
      bar = {
        latitude: barRow.latitude ?? null,
        longitude: barRow.longitude ?? null,
        raioPermitidoMetros: barRow.raio_permitido_metros ?? null,
      };
      policy = (barRow.youtube_credential_policy as CredentialPolicy) ?? "own_only";
    }

    // Só entra aqui se a política for `platform_pool`. `own_only` (padrão) não
    // toca a tabela de pool — não é estética: é o requisito de que a chave da
    // plataforma nunca seja lida para um bar que não pediu, e a tabela é
    // inacessível pelo papel `authenticated` justamente por isso (RLS ligado,
    // sem policy, migration `20261005000043`).
    if (policy === "platform_pool" && barRow?.youtube_pool_id) {
      const { data: pool } = await admin
        .from("youtube_credential_pools")
        .select("api_key, active")
        .eq("id", barRow.youtube_pool_id)
        .maybeSingle();
      // Pool inativo NÃO vira erro aqui: a cadeia segue até
      // `resolveYouTubeApiKey` devolver null e o participante receber
      // "CREDENTIAL_NOT_CONFIGURED" com o texto certo para a política. Um throw
      // aqui transformaria "o bar pediu pool e não há" em 503 de servidor —
      // o mesmo defeito que a Fase 8f conserta.
      if (pool?.active) poolKey = pool.api_key;
    }
  }

  return {
    roomId: room.id,
    hostId: room.host_id,
    youtubeApiKey: secretRow?.youtube_api_key ?? null,
    bar,
    policy,
    poolKey,
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
  // O passo que o dono do bar precisa. Só strings escritas aqui; nenhuma chave,
  // id de projeto ou token entra no corpo (ver `diagnostics.ts` para o lado do
  // log, que é separado).
  if (failure.hint) body.hint = failure.hint;

  return NextResponse.json(body, { status: failure.status, headers });
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

  // Uma única instância por requisição. Antes, `createAdmin()` era chamado duas
  // vezes (linhas 58 e 158) e cada chamada constrói um cliente Supabase novo,
  // com seu próprio pool de conexões HTTP — dentro de uma única busca. Em
  // serverless isso multiplica sockets por lambda.
  const admin = createAdmin();

  /**
   * Envolve TUDO que vem depois em try/catch. Este é o outro defeito da Fase 8f:
   * qualquer exceção (sem `SUPABASE_SERVICE_ROLE_KEY`, banco inacessível, timeout
   * no refresh token) saía da rota como exceção crua, o Next respondia HTML 500
   * e o `fetch` do cliente caía no `catch` de rede — o participante via
   * "Falha de rede ao buscar músicas" para um erro de servidor. Agora a resposta
   * é sempre JSON, com código, e o motivo vai para o log.
   */
  try {
    const room = await getRoomContext(supabase, admin, roomCode);
    const isDev = await isDevAccount(supabase);

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
        // `isDev` é o portão dos dois últimos degraus (OAuth do app e
        // `YOUTUBE_API_KEY`) — ver a doc de `resolveYouTubeApiKey`. Passar
        // `undefined` aqui, por engano, faria o dono do produto perder a busca
        // dele; passar `true` faria o bar de qualquer outro gastar a cota dele.
        return resolveYouTubeApiKey({
          roomKey: room?.youtubeApiKey ?? null,
          hostToken,
          platformKey: room?.poolKey ?? null,
          isDev,
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

    if (!outcome.ok) {
      logSearchFailure({
        roomCode,
        userId: user.id,
        failure: outcome.failure,
        reason: outcome.failure.reason ?? null,
      });
    }

    return renderOutcome(outcome);
  } catch (error) {
    // O detalhe (incluindo o `reason` cru, quando existe) fica no log do
    // servidor; a resposta é genérica DE PROPÓSITO, e com `code` para a tela
    // distinguir "sua configuração" de "nosso servidor".
    logSearchFailure({
      roomCode,
      userId: user.id,
      failure: {
        status: 503,
        error: "A busca está temporariamente indisponível.",
        code: "SERVER_MISCONFIGURED",
        hint: null,
      },
      thrown: error,
    });

    return NextResponse.json(
      { error: "A busca está temporariamente indisponível.", code: "SERVER_MISCONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * O log que faltava na Fase 4.
 *
 * Por que existe: `YouTubeApiError.reason` era guardado e nunca lido em lugar
 * nenhum, então a produção só podia dizer "502, mensagem genérica". Quem opera
 * o deploy precisa do `reason` real (`dailyLimitExceeded`, `ipRefererBlocked`,
 * `accessNotConfigured`) para saber se é cota, chave restrita ou API desligada —
 * e essa informação é do SERVIDOR, não da tela.
 *
 * O que NÃO entra aqui: chave, token, refresh token, ou o corpo bruto da
 * resposta do Google (que ecoa a URL com a chave no parâetro `key=`). O log leva
 * o código já classificado, o `reason` cru, sala, usuário e bar.
 */
function logSearchFailure(params: {
  roomCode: string;
  userId: string;
  failure: { status: number; error: string; code?: string; hint?: string | null };
  /** `reason` cru do Google, quando a falha veio do `YouTubeApiError`. */
  reason?: string | null;
  thrown?: unknown;
}): void {
  const { roomCode, userId, failure, reason, thrown } = params;
  const thrownMessage = thrown instanceof Error ? thrown.message : thrown ? String(thrown) : null;

  console.error(
    JSON.stringify({
      event: "youtube_search_failed",
      room: roomCode || null,
      user: userId,
      status: failure.status,
      code: failure.code ?? null,
      // O campo que faltava desde a Fase 4: `dailyLimitExceeded`,
      // `ipRefererBlocked`, `accessNotConfigured`. É o que separa "cota",
      // "chave restrita" e "API desligada" no log do deploy, e o `code` sozinho
      // não conta a história que o Google contou. Pode mencionar o id do
      // projeto da chave — fica no log do servidor, nunca no corpo da resposta.
      reason: reason ?? null,
      // A mensagem do `thrown`, quando a falha NÃO veio nomeada pelo Google
      // (exceção de config ou de rede). No caminho do `YouTubeApiError` isto é
      // `null` de propósito: a mensagem do Google pode ecoar a URL com a chave
      // no parâmetro `key=`, e o `reason` já cobre o diagnóstico.
      thrown: thrownMessage,
    })
  );
}