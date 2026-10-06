import { describe, expect, it } from "vitest";

import type { BarLocation } from "@/lib/bars/geo";
import type { YouTubeVideo } from "@/lib/youtube/types";
import type { RoomSearchContext, SearchPorts } from "./service";
import { YouTubeApiError } from "@/lib/youtube/errors";
import { searchYouTubeForRoom } from "./service";

const BAR_AT_BAR: BarLocation = {
  latitude: -23.5613,
  longitude: -46.6565,
  raioPermitidoMetros: 150,
};

const ROOM: RoomSearchContext = {
  roomId: "room-1",
  hostId: "host-1",
youtubeApiKey: null,
    bar: BAR_AT_BAR,
    policy: "own_only",
    poolKey: null,
};

const USER_COORDS = { latitude: -23.5613, longitude: -46.6565 };

const RESULT: YouTubeVideo = {
  videoId: "ABC123",
  title: "Uma música",
  thumbnailUrl: "https://img.youtube.com/vi/ABC123/mqdefault.jpg",
  channelTitle: "Canal",
  durationSeconds: 240,
};

function basePorts(overrides: Partial<SearchPorts> = {}): SearchPorts {
  return {
    roomCode: "KARAOK",
    searchQuery: "ana castela",
    userId: "user-1",
    clientIp: "127.0.0.1",
    userCoords: USER_COORDS,
    getRoom: async () => ROOM,
    getMembership: async () => "approved",
    consumeRateLimit: () => ({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }),
    cache: { get: async () => null, put: async () => {} },
    resolveCredential: async () => ({ key: "AIzaSy-X", source: "app" }),
    runSearch: async () => [RESULT],
    ...overrides,
  };
}

describe("searchYouTubeForRoom", () => {
  it("retorna resultados frescos e grava no cache", async () => {
    const put = { called: 0, query: "" };
    const outcome = await searchYouTubeForRoom(
      basePorts({
        cache: { get: async () => null, put: async (q) => { put.called += 1; put.query = q; } },
      })
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.results).toEqual([RESULT]);
    expect(outcome.data.cached).toBe(false);
    expect(outcome.data.source).toBe("app");
    expect(put.called).toBe(1);
    expect(put.query).toBe("ana castela");
  });

  it("usa o bucket normalizado como chave de cache", async () => {
    const get = { called: false };
    await searchYouTubeForRoom(
      basePorts({
        searchQuery: "  ANA   CASTELA!! ",
        cache: { get: async (q) => { get.called = true; expect(q).toBe("ana castela"); return null; }, put: async () => {} },
      })
    );
    expect(get.called).toBe(true);
  });

  it("cache quente evita busca e resolução de credencial", async () => {
    let searches = 0;
    let credentials = 0;
    const outcome = await searchYouTubeForRoom(
      basePorts({
        cache: { get: async () => [RESULT], put: async () => {} },
        resolveCredential: async () => { credentials += 1; return { key: "X", source: "dev" }; },
        runSearch: async () => { searches += 1; return [RESULT]; },
      })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.cached).toBe(true);
    expect(outcome.data.source).toBeNull();
    expect(searches).toBe(0);
    expect(credentials).toBe(0);
  });

  it("query vazia → 400", async () => {
    const outcome = await searchYouTubeForRoom(basePorts({ searchQuery: "   " }));
    expect(outcome).toEqual({ ok: false, failure: { status: 400, error: "Digite algo para buscar.", code: "EMPTY_QUERY" } });
  });

  it("rate limit excedido → 429 com retry-after", async () => {
    const resetAt = Date.now() + 5_000;
    const outcome = await searchYouTubeForRoom(
      basePorts({ consumeRateLimit: () => ({ allowed: false, remaining: 0, resetAt }) })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(429);
    expect(outcome.failure.retryAfterSeconds).toBe(5);
    expect(outcome.failure.code).toBe("RATE_LIMITED");
  });

  it("sala não encontrada → 404", async () => {
    const outcome = await searchYouTubeForRoom(basePorts({ getRoom: async () => null }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(404);
  });

  it("membro pendente → 403 PENDING", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({ getMembership: async () => "pending" })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(403);
    expect(outcome.failure.code).toBe("PENDING");
  });

  it("não-membro → 403 NOT_MEMBER", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({ getMembership: async () => "none" })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(403);
    expect(outcome.failure.code).toBe("NOT_MEMBER");
  });

  it("host isento: sem geo ainda busca", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({
        userCoords: null,
        getMembership: async () => "host",
        getRoom: async () => ({
          ...ROOM,
          bar: { latitude: null, longitude: null, raioPermitidoMetros: null },
        }),
      })
    );
    expect(outcome.ok).toBe(true);
  });

  it("participante sem geo → 403 GEO_UNAVAILABLE com geoRequired", async () => {
    const outcome = await searchYouTubeForRoom(basePorts({ userCoords: null }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(403);
    expect(outcome.failure.geoRequired).toBe(true);
    expect(outcome.failure.code).toBe("GEO_UNAVAILABLE");
  });

  it("participante fora do raio → 403 OUTSIDE_BAR", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({ userCoords: { latitude: -23.55, longitude: -46.633 } })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(403);
    expect(outcome.failure.code).toBe("OUTSIDE_BAR");
  });

  it("bar sem coords registradas bloqueia o participante (geo-unavailable)", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({
        getRoom: async () => ({
          ...ROOM,
          bar: { latitude: null, longitude: null, raioPermitidoMetros: 150 },
        }),
      })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(403);
    expect(outcome.failure.geoRequired).toBe(true);
    expect(outcome.failure.code).toBe("GEO_UNAVAILABLE");
  });

  // `API_ERROR` deixou de existir na Fase 8f: ele era o rótulo que escondia a
  // causa. O `Error` cru de `runSearch` agora vira `SEARCH_FAILED` (falha nossa
  // fora do protocolo do Google), e uma recusa real do Google vira o código
  // nomeado — ver "recusa do Google" abaixo.
  it("erro cru de runSearch → 502 SEARCH_FAILED", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({ runSearch: async () => { throw new Error("A cota de buscas no YouTube deste bar acabou por hoje."); } })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(502);
    expect(outcome.failure.code).toBe("SEARCH_FAILED");
  });

  it("recusa do Google → o código da causa, não um rótulo genérico", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({
        runSearch: async () => {
          throw new YouTubeApiError(
            "youtube(v3) search: dailyLimitExceeded",
            { error: { code: 403, errors: [{ reason: "dailyLimitExceeded", message: "Daily Limit Exceeded" }] } },
            403
          );
        },
      })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("QUOTA_EXHAUSTED");
    // O passo existe porque "cota acabou" tem solução diferente de "chave
    // inválida": trocar a chave ou usar o pool da plataforma.
    expect(outcome.failure.hint).toBeTruthy();
  });

  it("chave com restrição de origem → KEY_RESTRICTED com o passo do Google Cloud", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({
        runSearch: async () => {
          throw new YouTubeApiError(
            "unauthorized",
            { error: { code: 400, errors: [{ reason: "ipRefererBlocked", message: "Requests from referer <empty> are blocked." }] } },
            400
          );
        },
      })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("KEY_RESTRICTED");
    expect(outcome.failure.hint).toContain("Google Cloud");
  });

  // A configuração ausente é 503, não 502: o YouTube não recusou nada, o bar
  // simplesmente não tem credencial. `NO_CREDENTIAL` virou
  // `CREDENTIAL_NOT_CONFIGURED` porque "no credential" não dizia ao dono do bar
  // que a ação era dele.
  it("sem credencial → 503 CREDENTIAL_NOT_CONFIGURED sem chamar a API", async () => {
    let searches = 0;
    const outcome = await searchYouTubeForRoom(
      basePorts({
        resolveCredential: async () => null,
        runSearch: async () => { searches += 1; return [RESULT]; },
      })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(503);
    expect(outcome.failure.code).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(outcome.failure.hint).toBeTruthy();
    expect(searches).toBe(0);
  });

  // O defeito da Fase 8f: exceção na resolução da credencial subia crua da rota.
  it("exceção ao resolver a credencial → 503 SERVER_MISCONFIGURED, sem stack na resposta", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({
        resolveCredential: async () => { throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY"); },
      })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.status).toBe(503);
    expect(outcome.failure.code).toBe("SERVER_MISCONFIGURED");
    // A mensagem da env não pode vazar para o cliente: ela descreve o servidor.
    expect(outcome.failure.error).not.toContain("SUPABASE");
  });

  it("erro de busca não grava o cache", async () => {
    const put = { called: 0 };
    const outcome = await searchYouTubeForRoom(
      basePorts({
        runSearch: async () => { throw new Error("boom"); },
        cache: { get: async () => null, put: async () => { put.called += 1; } },
      })
    );
    expect(outcome.ok).toBe(false);
    expect(put.called).toBe(0);
  });

  it("chave do bar é usada e propagada como fonte room", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({ resolveCredential: async () => ({ key: "AIzaSy-BAR", source: "room" }) })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.source).toBe("room");
  });

  // O `hint` muda com a política do bar: em `own_only` a ação é do dono, e em
  // `platform_pool` é da operação — dizer "salve uma chave" para um bar que
  // pediu o pool Mandaria o dono configurar algo que a política proíbe.
  it("pool pedido sem pool disponível → o hint não pede chave ao dono", async () => {
    const outcome = await searchYouTubeForRoom(
      basePorts({
        getRoom: async () => ({ ...ROOM, policy: "platform_pool" }),
        resolveCredential: async () => null,
      })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(outcome.failure.hint).not.toContain("configurações da sala");
  });
});