import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

/**
 * Contrato HTTP de `/api/youtube/diagnostics` (Fase 8f).
 *
 * O que o módulo `diagnostics.test.ts` não cobre: o **portão**. É aqui que a
 * decisão de não dar o relatório de ambiente a quem não é dev acontece, e onde
 * o corpo da resposta é montado. Um endpoint que filtra no `probe` mas esquece
 * de filtrar no `GET` sem query vazaria a lista de variáveis do servidor para
 * qualquer participante logado.
 *
 * O segundo eixo é o vazamento: em **todos** os formatos (sem query, `?room=`,
 * `?probe=1`, e até no `catch` interno), nenhuma chave pode aparecer no corpo.
 */

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const state = {
    user: null as { id: string } | null,
    isDev: false,
    hostToken: null as string | null,
    rooms: [] as Row[],
    roomSecrets: new Map<string, string>(),
    bars: [] as Row[],
    pools: [] as Row[],
    /** Faz `createAdmin()` explodir, para exercitar o `catch` da rota. */
    adminThrows: null as Error | null,
  };

  type Query = {
    select(): Query;
    eq(field: string, value: unknown): Query;
    maybeSingle(): Promise<{ data: unknown }>;
  };

  const createQuery = (table: string, admin: boolean): Query => {
    const conditions: Array<[string, unknown]> = [];
    const query: Query = {
      select: () => query,
      eq: (field, value) => {
        conditions.push([field, value]);
        return query;
      },
      maybeSingle: async () => {
        if (table === "youtube_oauth_tokens") {
          return {
            data: state.hostToken ? { refresh_token: state.hostToken } : null,
          };
        }
        if (table === "rooms" && admin) {
          const id = conditions.find(([f]) => f === "id")?.[1];
          const secret = typeof id === "string" ? state.roomSecrets.get(id) : undefined;
          return { data: secret ? { youtube_api_key: secret } : null };
        }
        const key = table === "rooms_public" ? "rooms" : table;
        const rows =
          key === "bars" ? state.bars : key === "youtube_credential_pools" ? state.pools : state.rooms;
        const match = rows.find((row: Row) =>
          conditions.every(([field, value]) => row[field] === value)
        );
        return { data: match ?? null };
      },
    };
    return query;
  };

  return {
    state,
    reset(config: {
      user?: { id: string } | null;
      isDev?: boolean;
      hostToken?: string | null;
      rooms?: Row[];
      roomSecrets?: Record<string, string>;
      bars?: Row[];
      pools?: Row[];
      adminThrows?: Error | null;
    }) {
      state.user = config.user === undefined ? { id: "dev-1" } : config.user;
      state.isDev = config.isDev ?? true;
      state.hostToken = config.hostToken ?? null;
      state.rooms = config.rooms ?? [];
      state.roomSecrets = new Map(Object.entries(config.roomSecrets ?? {}));
      state.bars = config.bars ?? [];
      state.pools = config.pools ?? [];
      state.adminThrows = config.adminThrows ?? null;
    },
    makeSupabase: () => ({
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      rpc: async (name: string) => {
        if (name === "is_dev") return { data: state.isDev, error: null };
        return { data: null, error: { message: `rpc ${name} não mockada` } };
      },
      from: (table: string) => createQuery(table, false),
    }),
    makeAdmin: () => {
      if (state.adminThrows) throw state.adminThrows;
      return { from: (table: string) => createQuery(table, true) };
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.makeSupabase(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdmin: () => h.makeAdmin(),
}));
vi.mock("@/lib/youtube/host-oauth", () => ({
  getHostAccessToken: async () => h.state.hostToken,
}));
vi.mock("@/lib/youtube/credentials", async () => {
  const real = await vi.importActual<typeof import("@/lib/youtube/credentials")>(
    "@/lib/youtube/credentials"
  );
  return {
    ...real,
    // A chave de dev entra pelo mesmo caminho da rota real — a variável de
    // ambiente — em vez de um mock que devolveria string fixa.
    resolveDevApiKeyFromEnv: () => process.env.YOUTUBE_API_KEY?.trim() || null,
  };
});

import { GET } from "./route";

const DEV_KEY = "AIzaSy-CHAVE-DE-DEV-NAO-LOGAR";
const ROOM_KEY = "YT-KEY-DA-SALA-NAO-LOGAR";
const POOL_KEY = "AIzaSy-CHAVE-DO-POOL-NAO-LOGAR";

let googleMode: "ok" | "key-invalid" | "ip-blocked" = "ok";
const googleCalls: string[] = [];

const server = setupServer(
  http.get("https://www.googleapis.com/youtube/v3/search", ({ request }) => {
    const url = new URL(request.url);
    googleCalls.push(url.toString());
    if (googleMode === "key-invalid") {
      return HttpResponse.json(
        {
          error: {
            code: 400,
            message: `API key not valid. Please pass a valid API key. (key=${url.searchParams.get("key")})`,
            errors: [{ reason: "keyInvalid", message: "API key not valid" }],
          },
        },
        { status: 400 }
      );
    }
    if (googleMode === "ip-blocked") {
      return HttpResponse.json(
        {
          error: {
            code: 403,
            message: "The request cannot be completed because you have violated this API project's quota.",
            errors: [{ reason: "ipRefererBlocked", message: "..." }],
          },
        },
        { status: 403 }
      );
    }
    return HttpResponse.json({ items: [] }, { status: 200 });
  })
);

const ENV_KEYS = [
  "YOUTUBE_API_KEY",
  "YOUTUBE_OAUTH_CLIENT_ID",
  "YOUTUBE_OAUTH_CLIENT_SECRET",
  "YOUTUBE_APP_REFRESH_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_ENV",
  "VERCEL_REGION",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeAll(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

afterEach(() => {
  googleMode = "ok";
  googleCalls.length = 0;
  // Ambiente "limpo" por padrão: cada teste declara o que precisa.
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_service_role_de_teste";
  process.env.YOUTUBE_OAUTH_CLIENT_ID = "client-id-de-teste";
  process.env.YOUTUBE_OAUTH_CLIENT_SECRET = "client-secret-de-teste";
});

function requestFor(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/youtube/diagnostics${query}`);
}

function seedRoomWithKey(): void {
  h.reset({
    rooms: [{ id: "r1", code: "AB12", host_id: "host-1", bar_id: "b1" }],
    roomSecrets: { r1: ROOM_KEY },
  });
}

/** Nenhum segredo pode atravessar a fronteira, em nenhum formato. */
function semSegredo(body: unknown): void {
  const text = JSON.stringify(body);
  for (const segredo of [DEV_KEY, ROOM_KEY, POOL_KEY, "ya29.", "sb_secret_"]) {
    expect(text).not.toContain(segredo);
  }
}

describe("GET /api/youtube/diagnostics — portão", () => {
  it("sem sessão responde 401 e não diz nada do ambiente", async () => {
    h.reset({ user: null });
    process.env.YOUTUBE_API_KEY = DEV_KEY;

    const response = await GET(requestFor(""));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(body).not.toHaveProperty("envPresent");
    expect(body).not.toHaveProperty("runtime");
    semSegredo(body);
  });

  it("sessão que NÃO é dev recebe 403, mesmo com YOUTUBE_API_KEY no deploy", async () => {
    // Este é o teste que fecha o endpoint: sem ele, um participante logado
    // leria quais variáveis o servidor tem — inclusive a chave de dev.
    h.reset({ isDev: false });
    process.env.YOUTUBE_API_KEY = DEV_KEY;

    const response = await GET(requestFor("?probe=1&room=AB12"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(body).not.toHaveProperty("envPresent");
    expect(body).not.toHaveProperty("resolvedFrom");
    expect(googleCalls).toHaveLength(0);
    semSegredo(body);
  });

  it("não devolve o corpo de 403 em HTML (o cliente distingue do erro de rede)", async () => {
    h.reset({ isDev: false });
    const response = await GET(requestFor(""));
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/youtube/diagnostics — ambiente, sem gastar cota", () => {
  it("dev recebe o estado das variáveis POR NOME e nenhum valor", async () => {
    h.reset({ isDev: true });
    process.env.YOUTUBE_API_KEY = DEV_KEY;

    const response = await GET(requestFor(""));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.envPresent).toEqual({
      youtubeApiKey: true,
      oauthClientId: true,
      oauthClientSecret: true,
      appRefreshToken: false,
      supabaseServiceRole: true,
    });
    expect(body.isDev).toBe(true);
    expect(body.runtime).toHaveProperty("vercelEnv");
    expect(body.runtime).toHaveProperty("nodeEnv");
    // E o passo principal: sem gastar cota, o Google não foi chamado.
    expect(googleCalls).toHaveLength(0);
    semSegredo(body);
  });

  it("avisa que a chave de dev presente será ignorada por sessão não-dev", async () => {
    // O relatório é sempre montado com `isDev: true` neste caminho, mas a
    // assimetria é o ponto: o mesmo deploy, com a env presente, não serve a
    // quem não é dev. A tela de sala do bar não-dev é que mostra isso.
    h.reset({ isDev: true });
    process.env.YOUTUBE_API_KEY = DEV_KEY;

    const body = await (await GET(requestFor(""))).json();

    expect(body.ok).toBe(true);
    expect(body.nextSteps).toEqual([]);
  });

  it("env sem service role vira nextStep, não erro", async () => {
    h.reset({ isDev: true });
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const body = await (await GET(requestFor(""))).json();

    expect(body.ok).toBe(false);
    expect(body.nextSteps.join(" ")).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(body.envPresent.supabaseServiceRole).toBe(false);
  });
});

describe("GET /api/youtube/diagnostics — por sala, sem chamar o Google", () => {
  it("sala com chave própria resolve por `room`", async () => {
    seedRoomWithKey();

    const body = await (await GET(requestFor("?room=AB12"))).json();

    expect(body.resolvedFrom).toBe("room");
    expect(body.code).toBeNull();
    expect(body.hint).toBeNull();
    expect(body.room).toBe("AB12");
    expect(googleCalls).toHaveLength(0);
    semSegredo(body);
  });

  it("sala sem nada ganha o passo, não um 502", async () => {
    h.reset({ rooms: [{ id: "r1", code: "AB12", host_id: "host-1", bar_id: null }] });

    const body = await (await GET(requestFor("?room=AB12"))).json();

    expect(body.resolvedFrom).toBe("none");
    expect(body.code).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(body.hint).toContain("chave");
    semSegredo(body);
  });

  it("sala inexistente diz isso, sem fingir erro de configuração", async () => {
    h.reset({ rooms: [] });

    const body = await (await GET(requestFor("?room=ZZZZ"))).json();

    expect(body.resolvedFrom).toBe("none");
    expect(body.code).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(body.hint).toContain("ZZZZ");
  });

  it("OAuth do host tem precedência sobre o pool, e o pool sobre a chave de dev", async () => {
    h.reset({
      hostToken: "ya29.TOKEN-DO-HOST",
      rooms: [{ id: "r1", code: "AB12", host_id: "host-1", bar_id: "b1" }],
      bars: [{ id: "b1", youtube_credential_policy: "platform_pool", youtube_pool_id: "p1" }],
      pools: [{ id: "p1", api_key: POOL_KEY, active: true }],
    });
    process.env.YOUTUBE_API_KEY = DEV_KEY;

    const comHost = await (await GET(requestFor("?room=AB12"))).json();
    expect(comHost.resolvedFrom).toBe("host");

    h.state.hostToken = null;
    const comPool = await (await GET(requestFor("?room=AB12"))).json();
    expect(comPool.resolvedFrom).toBe("platform");
    semSegredo({ comHost, comPool });
  });

  it("pool inativo não é usado, e o passo cita a plataforma como causa possível", async () => {
    h.reset({
      rooms: [{ id: "r1", code: "AB12", host_id: "host-1", bar_id: "b1" }],
      bars: [{ id: "b1", youtube_credential_policy: "platform_pool", youtube_pool_id: "p1" }],
      pools: [{ id: "p1", api_key: POOL_KEY, active: false }],
    });

    const body = await (await GET(requestFor("?room=AB12"))).json();

    expect(body.resolvedFrom).toBe("none");
    // Pool inativo é a causa mais provável do `none` num bar `platform_pool`,
    // então o passo tem que apontar para ela — do contrário o dev vai caçar
    // problema de chave da sala num bar que nunca teve chave.
    expect(body.hint).toContain("política do bar");
    expect(body.hint).toContain("plataforma");
    semSegredo(body);
  });
});

describe("GET /api/youtube/diagnostics — probe (gasta cota de propósito)", () => {
  it("chave aceita: ok, com o passo de que o problema está em outro caminho", async () => {
    seedRoomWithKey();

    const body = await (await GET(requestFor("?room=AB12&probe=1"))).json();

    expect(body.ok).toBe(true);
    expect(body.googleReason).toBeNull();
    expect(body.httpStatus).toBe(200);
    expect(body.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(body.nextSteps.join(" ")).toContain("Chave aceita");
    // O probe é a única chamada que leva a chave na URL — e o corpo não a repete.
    expect(googleCalls[0]).toContain("maxResults=1");
    semSegredo(body);
  });

  it("sala inexistente no probe sai com o aviso, não como 'sem credencial'", async () => {
    // Achado no preview: `?room=ZEHBAR` (código de BAR, não de sala) devolvia
    // `CREDENTIAL_NOT_CONFIGURED` — igual a uma sala de verdade sem chave. O dev
    // lia "configure uma credencial" para uma sala que não existe, e o
    // `note` que explicava o sumiço só ia no ramo sem `probe`.
    const body = await (await GET(requestFor("?room=NAOEXISTE&probe=1"))).json();

    expect(body.note).toContain("não existe");
    expect(body.resolvedFrom).toBe("none");
    semSegredo(body);
  });

  it("reason cru do Google volta classificado, e a mensagem com ?key= NÃO volta", async () => {
    // Este é o objetivo do endpoint: sem ele, "chave inválida" e "chave com
    // restrição" eram indistinguíveis, e a mensagem do Google ecoa a URL com a
    // chave no parâmetro.
    googleMode = "key-invalid";
    seedRoomWithKey();

    const body = await (await GET(requestFor("?room=AB12&probe=1"))).json();

    expect(body.ok).toBe(false);
    expect(body.googleReason).toBe("keyInvalid");
    expect(body.code).toBe("KEY_INVALID");
    expect(body.hint).toContain("chave");
    expect(JSON.stringify(body)).not.toContain("key=");
    semSegredo(body);
  });

  it("distingue chave restrita (ipRefererBlocked) de chave inválida", async () => {
    googleMode = "ip-blocked";
    seedRoomWithKey();

    const body = await (await GET(requestFor("?room=AB12&probe=1"))).json();

    expect(body.code).toBe("KEY_RESTRICTED");
    expect(body.googleReason).toBe("ipRefererBlocked");
    expect(body.hint).toContain("restri");
    semSegredo(body);
  });

  it("sem credencial nenhuma, o probe não chama o Google", async () => {
    h.reset({ rooms: [] });

    const body = await (await GET(requestFor("?room=AB12&probe=1"))).json();

    expect(body.code).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(googleCalls).toHaveLength(0);
  });
});

describe("GET /api/youtube/diagnostics — quando o próprio diagnóstico quebra", () => {
  it("exceção com segredo é redigida, não devolvida", async () => {
    // O `createAdmin()` explodindo com uma mensagem que cita a URL da chave é
    // exatamente o caso que o `error.message` cru vazava. A resposta precisa
    // continuar útil (o `envPresent` volta) e continuar limpa.
    h.reset({ adminThrows: new Error(`falhou: https://www.googleapis.com/youtube?key=${ROOM_KEY}`) });

    const response = await GET(requestFor("?room=AB12&probe=1"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DIAGNOSTIC_FAILED");
    expect(body.detail.redacted).toBe(true);
    expect(body.nextSteps.join(" ")).toContain("omitida");
    semSegredo(body);
  });

  it("exceção inocente passa a mensagem, que é o que ajuda a diagnosticar", async () => {
    h.reset({ adminThrows: new Error("fetch failed: ECONNREFUSED") });

    const response = await GET(requestFor("?probe=1"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.detail.redacted).toBe(false);
    expect(body.detail.thrownMessage).toContain("ECONNREFUSED");
  });
});