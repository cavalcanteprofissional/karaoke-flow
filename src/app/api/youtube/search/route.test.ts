import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type GeoValue = string | null;

  const state = {
    user: null as { id: string } | null,
    geo: new Map<string, GeoValue>(),
    songCache: new Map<string, { results: Row[]; created_at: string }>(),
    hostTokens: new Map<string, { refresh_token: string }>(),
    tables: {
rooms: [] as Row[],
        bars: [] as Row[],
        members: [] as Row[],
      },
    };

    type WalkableQuery = {
      select(): WalkableQuery;
      eq(field: string, value: unknown): WalkableQuery;
      maybeSingle(): Promise<{ data: unknown }>;
      upsert(row: Record<string, unknown>): Promise<{ error: null; data: null }>;
    };

    const createQuery = (table: string, admin: boolean): WalkableQuery => {
      const conditions: Array<[string, unknown]> = [];
      const query: WalkableQuery = {
        select(): WalkableQuery {
          return query;
        },
        eq(field: string, value: unknown): WalkableQuery {
          conditions.push([field, value]);
          return query;
        },
      maybeSingle: async () => {
        if (admin && table === "song_cache") {
          const key = conditions.find(([f]) => f === "query_normalized")?.[1];
          return { data: (key !== undefined && typeof key === "string" && state.songCache.get(key)) || null };
        }
        if (admin && table === "youtube_oauth_tokens") {
          const hostId = conditions.find(([f]) => f === "host_id")?.[1];
          return {
            data:
              hostId !== undefined && typeof hostId === "string"
                ? state.hostTokens.get(hostId) ?? null
                : null,
          };
        }
        const rows =
          table === "room_members"
            ? state.tables.members
            : (state.tables[table as keyof typeof state.tables] ?? []);
        const match = rows.find((row) => conditions.every(([field, value]) => row[field] === value));
        return { data: match ?? null };
      },
      upsert: async (row: Row) => {
        if (table === "song_cache") {
          const normalized = row.query_normalized as string;
          state.songCache.set(normalized, {
            results: (row.results as Row[]) ?? [],
            created_at: new Date().toISOString(),
          });
        }
        if (table === "youtube_oauth_tokens") {
          state.hostTokens.set(row.host_id as string, { refresh_token: row.refresh_token as string });
        }
        return { error: null, data: null };
      },
    };
    return query;
  };

  return {
    state,
    reset(config: { rooms?: Row[]; bars?: Row[]; members?: Row[] }) {
      state.tables.rooms = config.rooms ?? [];
      state.tables.bars = config.bars ?? [];
      state.tables.members = config.members ?? [];
      state.user = { id: "member-id" };
      state.geo.clear();
      state.songCache.clear();
      state.hostTokens.clear();
    },
    makeSupabase: () => ({
      auth: {
        getUser: async () => ({ data: { user: state.user } }),
      },
      from: (table: string) => createQuery(table, false),
    }),
    makeAdmin: () => ({
      from: (table: string) => createQuery(table, true),
    }),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = h.state.geo.get(name);
      return value !== undefined && value !== null ? { value } : undefined;
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.makeSupabase(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdmin: () => h.makeAdmin(),
}));

import { GET } from "./route";

const ROOM_KEY = "YT-KEY-ROOM-SECRET-123";

let googleMode: "ok" | "quota" | "search-error" = "ok";
const searchCalls: Array<{ q: string | null; key: string | null }> = [];

const server = setupServer(
  http.get("https://www.googleapis.com/youtube/v3/search", ({ request }) => {
    const url = new URL(request.url);
    searchCalls.push({ q: url.searchParams.get("q"), key: url.searchParams.get("key") });
    if (googleMode === "quota") {
      return HttpResponse.json(
        {
          error: {
            code: 403,
            message: "The quota for the project was exceeded.",
            errors: [{ reason: "quotaExceeded", message: "..." }],
          },
        },
        { status: 403 }
      );
    }
    if (googleMode === "search-error") {
      return HttpResponse.json({ error: { code: 500, message: "nope" } }, { status: 500 });
    }
    return HttpResponse.json({
      items: [
        {
          id: { kind: "youtube#video", videoId: "vid-abc-123" },
          snippet: {
            title: "Love Shack — Karaokê",
            channelTitle: "Karaokê Brasil",
            thumbnails: { medium: { url: "https://img.example/thumb1.jpg" } },
          },
        },
        {
          id: { videoId: "vid-def-456" },
          snippet: { title: "Total Eclipse Song", channelTitle: "Chorus" },
        },
      ],
    });
  }),
  http.get("https://www.googleapis.com/youtube/v3/videos", () =>
    HttpResponse.json({
      items: [
        { id: "vid-abc-123", contentDetails: { duration: "PT3M21S" } },
        { id: "vid-def-456", contentDetails: { duration: "PT4M5S" } },
      ],
    })
  )
);

function requestFor(extra: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    "http://localhost/api/youtube/search?room=AB12&q=kate%20bush",
    { headers: { "x-forwarded-for": "1.2.3.4", ...extra } }
  );
}

function seedRoom(overrides: Record<string, unknown> = {}): void {
  h.reset({
    rooms: [
      {
        id: "r1",
        code: "AB12",
        host_id: "host-id",
        youtube_api_key: ROOM_KEY,
        bar_id: "b1",
        ...overrides,
      },
    ],
    bars: [
      {
        id: "b1",
        latitude: -23.55066,
        longitude: -46.63338,
        raio_permitido_metros: 150,
      },
    ],
    members: [{ room_id: "r1", user_id: "member-id", status: "approved" }],
  });
  h.state.geo.set(
    "kf-geo",
    JSON.stringify({
      status: "granted",
      coords: { latitude: -23.55066, longitude: -46.63337 },
      ts: new Date().toISOString(),
    })
  );
}

function setGeoCookie(latitude: number, longitude: number): void {
  h.state.geo.set(
    "kf-geo",
    JSON.stringify({ status: "granted", coords: { latitude, longitude }, ts: new Date().toISOString() })
  );
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  googleMode = "ok";
  searchCalls.length = 0;
  h.reset({});
});
afterAll(() => {
  server.close();
});

describe("GET /api/youtube/search", () => {
  it("não autenticado retorna 401", async () => {
    h.reset({});
    h.state.user = null;
    const response = await GET(requestFor());
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("UNAUTHENTICATED");
    expect(searchCalls).toHaveLength(0);
  });

  it("sala não encontrada retorna 404", async () => {
    h.reset({});
    const response = await GET(requestFor());
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("ROOM_NOT_FOUND");
  });

  it("membro pendente retorna 403 PENDING", async () => {
    h.reset({
      rooms: [{ id: "r1", code: "AB12", host_id: "host-id", youtube_api_key: ROOM_KEY, bar_id: null }],
      members: [{ room_id: "r1", user_id: "member-id", status: "pending" }],
    });
    const response = await GET(requestFor());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("PENDING");
    expect(searchCalls).toHaveLength(0);
  });

  it("busca com sucesso usando a chave do bar, cache miss", async () => {
    seedRoom();
    const response = await GET(requestFor());

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      results: Array<{ videoId: string; title: string; durationSeconds: number | null }>;
      cached: boolean;
      source: string;
    };
    expect(body.cached).toBe(false);
    expect(body.source).toBe("room");
    expect(body.results).toEqual([
      {
        videoId: "vid-abc-123",
        title: "Love Shack — Karaokê",
        thumbnailUrl: "https://img.example/thumb1.jpg",
        channelTitle: "Karaokê Brasil",
        durationSeconds: 201,
      },
      {
        videoId: "vid-def-456",
        title: "Total Eclipse Song",
        thumbnailUrl: null,
        channelTitle: "Chorus",
        durationSeconds: 245,
      },
    ]);
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0].key).toBe(ROOM_KEY);
  });

  it("a chave do bar nunca vaza no payload da resposta", async () => {
    seedRoom();
    const response = await GET(requestFor());
    const text = await response.text();
    expect(text).not.toContain(ROOM_KEY);
  });

  it("segunda busca usa o cache compartilhado sem bater no YouTube", async () => {
    seedRoom();
    await GET(requestFor());
    expect(searchCalls).toHaveLength(1);

    const second = await GET(requestFor());
    expect(second.status).toBe(200);
    const body = (await second.json()) as { cached: boolean; source: string | null };
    expect(body.cached).toBe(true);
    expect(body.source).toBeNull();
    expect(searchCalls).toHaveLength(1);
  });

  it("cota esgotada do YouTube vira 502 com mensagem amigável", async () => {
    seedRoom();
    googleMode = "quota";
    const response = await GET(requestFor());
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string; code?: string };
    expect(body.code).toBe("API_ERROR");
    expect(body.error).toContain("cota");
  });

  it("erro do YouTube sem cota vira 502 genérico", async () => {
    seedRoom();
    googleMode = "search-error";
    const response = await GET(requestFor());
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("YouTube");
  });

  it("sem credencial configurada retorna 502 NO_CREDENTIAL", async () => {
    seedRoom({ youtube_api_key: null });
    const previous = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    const response = await GET(requestFor());
    if (previous !== undefined) process.env.YOUTUBE_API_KEY = previous;
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("NO_CREDENTIAL");
    expect(searchCalls).toHaveLength(0);
  });

  it("rate limit por ip:usuário retorna 429 com Retry-After", async () => {
    seedRoom();
    h.state.user = { id: "rl-user" };

    const url = new URL("http://localhost/api/youtube/search");
    url.searchParams.set("room", "AB12");
    url.searchParams.set("q", "love");
    const many = new NextRequest(url, { headers: { "x-forwarded-for": "1.2.3.4" } });

    let allowed = 0;
    let blocked: number | null = null;
    let retryAfter: string | null = null;
    for (let i = 0; i < 70; i++) {
      const response = await GET(many);
      if (response.status === 429) {
        blocked = response.status;
        retryAfter = response.headers.get("Retry-After");
        break;
      }
      allowed += 1;
    }
    expect(allowed).toBe(60);
    expect(blocked).toBe(429);
    expect(retryAfter).toMatch(/^\d+$/);
  });

  it("participante fora do raio do bar é bloqueado (OUTSIDE_BAR)", async () => {
    seedRoom();
    setGeoCookie(-23.6, -46.7);
    const response = await GET(requestFor());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; geoRequired: boolean };
    expect(body.code).toBe("OUTSIDE_BAR");
    expect(body.geoRequired).toBe(true);
    expect(searchCalls).toHaveLength(0);
  });

  it("participante dentro do raio consegue buscar", async () => {
    seedRoom();
    const response = await GET(requestFor());
    expect(response.status).toBe(200);
    expect((await response.json()).cached).toBe(false);
  });

  it("bar sem coords + participante sem geo é bloqueado (GEO_UNAVAILABLE)", async () => {
    h.reset({
      rooms: [
        { id: "r1", code: "AB12", host_id: "host-id", youtube_api_key: ROOM_KEY, bar_id: null },
      ],
      members: [{ room_id: "r1", user_id: "member-id", status: "approved" }],
    });
    const response = await GET(requestFor());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; geoRequired: boolean };
    expect(body.code).toBe("GEO_UNAVAILABLE");
    expect(body.geoRequired).toBe(true);
  });

  it("o host é isento do geo gate", async () => {
    seedRoom();
    h.state.user = { id: "host-id" };
    const response = await GET(requestFor());
    expect(response.status).toBe(200);
    expect((await response.json()).source).toBe("room");
  });
});