import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  buildOauthUrlFrom,
  makeOauthState,
  parseOauthState,
  YOUTUBE_OAUTH_STATE_COOKIE,
} from "@/app/auth/youtube/oauth";
import { GET } from "./route";

function requestAt(host = "localhost:3000", path = "/auth/youtube/authorize?room=AB12"): NextRequest {
  return new NextRequest(`http://${host}${path}`);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authorize → callback (roundtrip do state)", () => {
  it("state não é duplo-encodado e volta inteiro após um único decode", () => {
    const state = makeOauthState("AB12");
    const url = buildOauthUrlFrom(requestAt(), state);

    const returned = url.searchParams.get("state");
    expect(returned).toBe(state);
    expect(returned).not.toContain("%25");

    const parsed = parseOauthState(returned);
    expect(parsed).not.toBeNull();
    expect(parsed?.nonce).toHaveLength(32);
    expect(parsed?.room).toBe("AB12");
  });

  it("GET redireciona para a Google com state decodável uma única vez", async () => {
    vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", "client-id.de.test");

    const response = await GET(requestAt());
    expect(response.status).toBe(302);

    const location = new URL(response.headers.get("location") ?? "");
    const returned = location.searchParams.get("state");
    expect(returned).not.toContain("%25");
    expect(parseOauthState(returned)?.room).toBe("AB12");

    const cookie = response.cookies.get(YOUTUBE_OAUTH_STATE_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe(returned);
  });

  it("em production no localhost o cookie do state NÃO é secure (teste local)", async () => {
    vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", "client-id.de.test");
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET(requestAt());
    const cookie = response.cookies.get(YOUTUBE_OAUTH_STATE_COOKIE);
    expect(cookie?.secure).toBe(false);
  });

  it("error/missing no callback nunca chega com nonce duplicado", () => {
    const state = makeOauthState(undefined);
    const parsed = parseOauthState(state);
    expect(parsed?.room).toBeUndefined();
    expect(parsed?.nonce).toHaveLength(32);
  });
});