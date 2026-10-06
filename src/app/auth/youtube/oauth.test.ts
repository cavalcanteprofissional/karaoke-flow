import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  buildOauthUrlFrom,
  makeOauthState,
  oauthBaseUrl,
  parseOauthState,
  resetMissingAppUrlWarning,
  YOUTUBE_OAUTH_SCOPE,
} from "./oauth";

/**
 * O `redirect_uri` do OAuth do YouTube é o ponto onde "funciona na minha máquina,
 * não funciona no site" vira erro de configuração.
 *
 * A armadilha que estes testes travam: pareceria mais seguro derivar a base do
 * host da requisição. Não é. O Google compara o `redirect_uri` caractere a
 * caractere com o que está registrado no console, então um deploy de preview
 * mandando `https://karaoke-xyz.vercel.app/...` é recusado com
 * `redirect_uri_mismatch`. A env é a fonte da verdade.
 */
describe("oauthBaseUrl", () => {
  beforeEach(() => {
    resetMissingAppUrlWarning();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetMissingAppUrlWarning();
  });

  function requestTo(origin: string): NextRequest {
    return new NextRequest(`${origin}/auth/youtube/authorize?room=AB12`);
  }

  it("usa NEXT_PUBLIC_APP_URL quando existe, ignorando barra final", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://karaoke.exemplo.com.br/");
    expect(oauthBaseUrl(requestTo("https://deploy-abc.vercel.app"))).toBe(
      "https://karaoke.exemplo.com.br"
    );
  });

  // O caso do preview: o host da requisição NÃO pode vencer a env.
  it("em preview, a env registrada ganha do host do deploy", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://karaoke.exemplo.com.br");
    expect(oauthBaseUrl(requestTo("https://deploy-abc.vercel.app"))).toBe(
      "https://karaoke.exemplo.com.br"
    );
  });

  it("sem env, usa o host da requisição (dev local)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(oauthBaseUrl(requestTo("http://localhost:3000"))).toBe("http://localhost:3000");
  });

  it("sem env na Vercel, avisa uma vez no log", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    oauthBaseUrl(requestTo("https://deploy-abc.vercel.app"));
    oauthBaseUrl(requestTo("https://deploy-abc.vercel.app"));

    // Uma vez só: o aviso é por requisição, e o fluxo gera várias.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("NEXT_PUBLIC_APP_URL");
    warn.mockRestore();
  });

  it("sem env e sem Vercel, não avisa (dev local não é erro)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    oauthBaseUrl(requestTo("http://localhost:3000"));

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("buildOauthUrlFrom", () => {
  beforeEach(() => {
    vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", "client.apps.googleusercontent.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://karaoke.exemplo.com.br");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("monta a URL de autorização com o redirect_uri registrado", () => {
    const url = buildOauthUrlFrom(
      new NextRequest("http://localhost:3000/auth/youtube/authorize?room=AB12"),
      "state-123"
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://karaoke.exemplo.com.br/auth/youtube/callback"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  // `youtube.readonly` é o escopo mínimo que ainda autoriza `search.list`. A
  // tempting alternativa é `youtube` (acesso total à conta do host); ela não é
  // necessária para buscar e ampliaria o consentimento pedido a cada dono de
  // bar sem ganho funcional.
  it("pede apenas youtube.readonly, não a conta inteira", () => {
    const url = buildOauthUrlFrom(
      new NextRequest("http://localhost:3000/auth/youtube/authorize?room=AB12"),
      "state-123"
    );

    expect(url.searchParams.get("scope")).toBe(YOUTUBE_OAUTH_SCOPE);
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.readonly"
    );
    expect(url.searchParams.get("scope")).not.toBe("https://www.googleapis.com/auth/youtube");
  });

  // `access_type=offline` sem isso: o Google devolve access token e nenhum
  // refresh token, e a conexão morre em uma hora sem que ninguém perceba.
  it("pede access_token offline, senão a conexão expira em 1h", () => {
    const url = buildOauthUrlFrom(
      new NextRequest("http://localhost:3000/auth/youtube/authorize?room=AB12"),
      "state-123"
    );

    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("state do OAuth", () => {
  it("faz round-trip com o código da sala normalizado", () => {
    const raw = makeOauthState("ab12");
    expect(parseOauthState(raw)?.room).toBe("AB12");
  });

  it("aceita state sem sala (conexão avulsa)", () => {
    const parsed = parseOauthState(makeOauthState(undefined));
    expect(parsed?.room).toBeUndefined();
    expect(parsed?.nonce).toBeTruthy();
  });

  // Um state malformado volta pela porta de `parseOauthState`, e a rota trata
  // como inválido. O teste trava que não há `throw` escapando.
  it("state inválido retorna null em vez de estourar", () => {
    expect(parseOauthState(null)).toBeNull();
    expect(parseOauthState("")).toBeNull();
    expect(parseOauthState("{não é json")).toBeNull();
    expect(parseOauthState('{"semNonce":true}')).toBeNull();
  });

  it("cada state tem nonce diferente", () => {
    const first = parseOauthState(makeOauthState("AB12"))?.nonce;
    const second = parseOauthState(makeOauthState("AB12"))?.nonce;
    expect(first).not.toBe(second);
  });
});