import type { BarLocation } from "@/lib/bars/geo";
import type { RateLimitDecision } from "@/lib/youtube/rate-limit";
import type { ResolvedApiKey } from "@/lib/youtube/credentials";
import type { SongCacheStore } from "@/lib/youtube/cache";
import type { YouTubeVideo } from "@/lib/youtube/types";
import type { GeoCoordinates } from "@/lib/consent/geo";
import { normalizeQuery } from "@/lib/youtube/cache";
import { PRESENCE_ERROR_GEO, checkPresence } from "@/lib/bars/geo";
import { classifyYouTubeError } from "@/lib/youtube/errors";
import { YouTubeApiError } from "@/lib/youtube/errors";

export type MembershipStatus = "host" | "approved" | "pending" | "none";

/** Política de credencial do bar (migration `20261005000043`). */
export type CredentialPolicy = "own_only" | "platform_pool";

export type RoomSearchContext = {
  roomId: string;
  hostId: string;
  youtubeApiKey: string | null;
  bar: BarLocation;
  /**
   * `platform_pool` habilita o degrau 3 da cadeia (chave da conta de
   * EMPRESA). `own_only` — o padrão — não tem pool, e a rota resolve a chave do
   * pool como `null` sem nem ler a tabela.
   */
  policy: CredentialPolicy;
  /**
   * Chave do pool, já resolvida pela rota (somente quando `policy` é
   * `platform_pool` e o pool está ativo). `null` nos outros casos. Fica no
   * contexto em vez de virar uma consulta dentro do service porque a leitura
   * precisa de service role, e `service.ts` é puro de banco por contrato — a
   * rota é a fronteira que conhece Supabase.
   */
  poolKey: string | null;
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
    credential: ResolvedApiKey;
  }) => Promise<YouTubeVideo[]>;
};

export type SearchFailure = {
  status: 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503;
  error: string;
  retryAfterSeconds?: number;
  geoRequired?: boolean;
  code?: string;
  /**
   * O que o DONO do bar precisa fazer, quando há ação (Fase 8f). A tela usa
   * para mostrar o passo, e o `reason` cru do Google fica no log do servidor
   * (`diagnostics.ts`) — nunca no corpo.
   */
  hint?: string | null;
  /**
   * O `reason` cru do Google (`dailyLimitExceeded`, `ipRefererBlocked`,
   * `accessNotConfigured`, …), só para o log do servidor.
   *
   * **Nunca vai para a resposta.** `renderOutcome` monta o corpo campo a
   * campo, e `hint` é a versão escrita para o humano — o campo existir aqui é
   * justamente para o log ter o dado que faltava na Fase 4, e não para a tela
   * ganhar um termo em inglês. Quem quiser o detalhe sob demanda tem o
   * `GET /api/youtube/diagnostics?probe=1`, que é dev-only.
   */
  reason?: string | null;
};

export type SearchSuccess = {
  results: YouTubeVideo[];
  cached: boolean;
  source: ResolvedApiKey["source"] | null;
};

export type SearchOutcome = { ok: true; data: SearchSuccess } | { ok: false; failure: SearchFailure };

const EMPTY_QUERY: SearchFailure = { status: 400, error: "Digite algo para buscar.", code: "EMPTY_QUERY" };

/**
 * A API do YouTube não foi consultada e não foi ela que recusou — é este
 * servidor que não conseguiu responder. Por isso `503` e não `502`, e por isso
 * o texto não promete que "tente de novo" resolve: a causa é ambiente
 * (service role ausente, pool inativo, banco inacessível), e o dono do bar não
 * tem nada a consertar. Quem conserta é quem opera o deploy.
 */
const SERVER_MISCONFIGURED: SearchFailure = {
  status: 503,
  error: "A busca está temporariamente indisponível.",
  hint: null,
  code: "SERVER_MISCONFIGURED",
};

/**
 * Falha nossa dentro de `runSearch` que não veio como `YouTubeApiError`: erro de
 * rede no `fetch`, URL malformada, JSON inesperado. `502` porque o proxy da
 * aplicação falhou ao falar com o YouTube; o `code` separa isso de uma recusa
 * do Google, que sempre chega nomeada.
 */
const SERVER_SEARCH_FAILED: SearchFailure = {
  status: 502,
  error: "Não foi possível buscar no YouTube agora. Tente de novo em instantes.",
  hint: null,
  code: "SEARCH_FAILED",
};

/**
 * Orquestra a busca de músicas da sala (spec §4 Fase 4): autenticação/membro,
 * rate limit, gate de presença física, cache compartilhado e resolução de
 * credencial (chave do bar → OAuth do host → pool da plataforma → OAuth do app
 * → chave de dev, esta última só para conta `dev`) — tudo com portas
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

  /**
   * A resolução da credencial entra no MESMO tratamento de falha da chamada à
   * API (Fase 8f). Antes ela ficava fora: uma exceção daqui — `createAdmin()`
   * sem `SUPABASE_SERVICE_ROLE_KEY`, pool apontado mas inativo, timeout lendo o
   * refresh token — subia da rota como exceção crua, o Next respondia HTML e o
   * cliente caía no `catch` de rede e mostrava "Falha de rede ao buscar
   * músicas" para um erro de servidor. Aqui ela vira `failure` com código.
   */
  let credential: ResolvedApiKey | null = null;
  try {
    credential = await ports.resolveCredential();
  } catch {
    return { ok: false, failure: SERVER_MISCONFIGURED };
  }

  if (!credential) {
    return {
      ok: false,
      failure: {
        status: 503,
        error: "Nenhuma credencial do YouTube configurada para este bar.",
        // O `503` + este `hint` é o que substitui a mensagem opaca da Fase 4:
        // o participante vê que a busca está desligada por configuração, e o
        // dono do bar recebe o passo em vez de uma desculpa genérica.
        hint: room.policy === "own_only"
          ? "O dono do bar precisa salvar uma chave da YouTube Data API v3 nas configurações da sala."
          : "Este bar pediu a chave da plataforma, mas nenhuma está disponível agora.",
        code: "CREDENTIAL_NOT_CONFIGURED",
      },
    };
  }

  try {
    const results = await ports.runSearch({ query, credential });
    await ports.cache.put(query, results);
    return { ok: true, data: { results, cached: false, source: credential.source } };
  } catch (error) {
    return { ok: false, failure: failureFromSearchError(error) };
  }
}

/**
 * Converte a exceção da busca em `failure` com o código do Google preservado.
 *
 * O ponto que fecha o defeito reportado: `YouTubeApiError.reason` já era
 * guardado desde a Fase 4 e nunca lido. Agora ele é classificado
 * (`classifyYouTubeError`), o texto da tela diz a causa certa — chave com
 * restrição, API não habilitada, cota — e a distinção que mais importa em
 * produção (`KEY_RESTRICTED`) aparece: a busca é server-side, não manda
 * `Referer`, e o IP de saída do deploy não é o da máquina do dono.
 */
function failureFromSearchError(error: unknown): SearchFailure {
  if (error instanceof YouTubeApiError) {
    const classified = classifyYouTubeError({
      reason: error.reason,
      message: error.message,
      httpStatus: error.code,
      // Vem do header, não da mensagem: um 429 do Google costuma ter
      // `Retry-After: 60` e nenhum texto que o diga.
      retryAfterHeader: error.retryAfterHeader,
    });
    return {
      status: classified.status,
      error: classified.friendly,
      hint: classified.hint,
      code: classified.code,
      // Vai só para o log do servidor. Sem o `reason`, "502, sem causa" era
      // tudo que a produção conseguia dizer do relato da Fase 8f.
      reason: error.reason ?? null,
      ...(classified.retryAfterSeconds !== null
        ? { retryAfterSeconds: classified.retryAfterSeconds }
        : {}),
    };
  }

  // `runSearch` não é só HTTP do Google: é o `fetch`, a construção da URL e o
  // parse. Qualquer coisa que não seja `YouTubeApiError` é falha nossa, e dizer
  // "tente de novo" para o dono não ajuda ninguém.
  return SERVER_SEARCH_FAILED;
}

export function presenceErrorForGeo(): string {
  return PRESENCE_ERROR_GEO;
}