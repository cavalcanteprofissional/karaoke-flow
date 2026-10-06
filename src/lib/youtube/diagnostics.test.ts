import { describe, expect, it, vi } from "vitest";

import { probeYouTubeCredential, safeDiagnosticDetail } from "./diagnostics";
import { YouTubeApiError } from "./errors";

/**
 * O probe é o instrumento de diagnóstico da Fase 8f. O teste mais importante
 * daqui não é "classifica X", é o de vazamento: a chave jamais pode aparecer no
 * resultado, porque o endpoint é lido por gente — mas o endpoint também pode ser
 * copiado para um chamado, e um `?key=` num log é uma chave no histórico do
 * git, do Slack e do provedor de logs.
 */
describe("probeYouTubeCredential", () => {
  const KEY = "AIzaSy-SECRET-DO-NOT-LOGAR";

  function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }

  it("sem credencial, responde sem chamar a API e diz o que falta", async () => {
    const fetcher = vi.fn();
    const result = await probeYouTubeCredential({ credential: null, fetcher });

    expect(result.ok).toBe(false);
    expect(result.source).toBe("none");
    expect(result.code).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(result.httpStatus).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("chave aceita devolve ok e o custo fica baixo (maxResults=1)", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ items: [] }, 200));
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "room" },
      fetcher,
    });

    expect(result.ok).toBe(true);
    expect(result.code).toBeNull();
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("maxResults")).toBe("1");
    expect(url.searchParams.get("part")).toBe("snippet");
  });

  it("propaga o reason do Google (o que faltava na Fase 4)", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 403, errors: [{ reason: "dailyLimitExceeded" }] } }, 403)
    );
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "dev" },
      fetcher,
    });

    expect(result.ok).toBe(false);
    expect(result.googleReason).toBe("dailyLimitExceeded");
    expect(result.code).toBe("QUOTA_EXHAUSTED");
    expect(result.httpStatus).toBe(403);
  });

  it("chave com restrição de origem é diagnosticada como tal", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ error: { errors: [{ reason: "ipRefererBlocked" }] } }, 400)
    );
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "dev" },
      fetcher,
    });

    expect(result.code).toBe("KEY_RESTRICTED");
    expect(result.hint).toContain("Google Cloud");
  });

  it("429 traz o Retry-After do header", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 429, {
        "retry-after": "30",
      })
    );
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "room" },
      fetcher,
    });

    expect(result.code).toBe("RATE_LIMITED_BY_YOUTUBE");
  });

  it("falha de rede não vira exceção", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "host" },
      fetcher,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("YOUTUBE_UNREACHABLE");
    expect(result.httpStatus).toBeNull();
  });

  // O probe roda como a busca roda: sem Referer. Se mandasse, daria verde para
  // a configuração que está quebrando o app.
  it("não envia Referer", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ items: [] }, 200));
    await probeYouTubeCredential({ credential: { key: KEY, source: "room" }, fetcher });

    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({});
  });

  it("OAuth vai como Bearer, não como ?key=", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ items: [] }, 200));
    await probeYouTubeCredential({ credential: { key: "ya29.TOKEN", source: "host" }, fetcher });

    const url = new URL(String(fetcher.mock.calls[0][0]));
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(url.searchParams.get("key")).toBeNull();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.TOKEN");
  });

  // ── O teste que protege o segredo ──────────────────────────────────────────
  it("a chave NÃO aparece no relatório, em nenhum campo", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ error: { errors: [{ reason: "keyInvalid" }] } }, 400)
    );
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "room" },
      fetcher,
    });

    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain("AIzaSy");
  });

  it("a chave NÃO aparece nem quando o Google a repete na própria mensagem", async () => {
    // O `message` do Google às vezes traz a URL com `?key=`. O probe alimenta a
    // classificação com ele, mas devolve só `googleReason` e `hint`, que são
    // strings escritas aqui.
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 400,
            message: `API key not valid: ${KEY} (https://www.googleapis.com/youtube/v3/search?key=${KEY})`,
            errors: [{ reason: "keyInvalid" }],
          },
        },
        400
      )
    );
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "dev" },
      fetcher,
    });

    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("mede a latência do probe", async () => {
    let clock = 1000;
    const fetcher = vi.fn().mockImplementation(async () => {
      clock += 250;
      return jsonResponse({ items: [] }, 200);
    });
    const result = await probeYouTubeCredential({
      credential: { key: KEY, source: "room" },
      fetcher,
      now: () => clock,
    });

    expect(result.elapsedMs).toBe(250);
  });
});

describe("safeDiagnosticDetail", () => {
  it("nunca repassa a mensagem do Google, que pode ecoar a ?key=", () => {
    const error = new YouTubeApiError(
      "API key not valid: AIzaSy-SECRET",
      { error: { errors: [{ reason: "keyInvalid" }] } },
      400
    );
    const detail = safeDiagnosticDetail(error);

    expect(detail.googleReason).toBe("keyInvalid");
    expect(detail.thrownMessage).toBeNull();
    expect(JSON.stringify(detail)).not.toContain("AIzaSy-SECRET");
  });

  it("erro nosso (sem YouTubeApiError) passa a mensagem", () => {
    const detail = safeDiagnosticDetail(new Error("Credenciais de service role ausentes"));
    expect(detail.thrownMessage).toContain("service role");
    expect(detail.redacted).toBe(false);
  });

  it("exceção nossa que cita a chave NAO passa a mensagem crua", () => {
    // O caso que a função original deixava vazar: `fetch` do token de OAuth e o
    // cliente do Supabase podem montar uma exceção citando a URL/erro com a
    // chave. Filtro só no `YouTubeApiError` não segura isto.
    const detail = safeDiagnosticDetail(
      new Error(
        'request to https://www.googleapis.com/youtube/v3/search?key=AIzaSy-SECRET-DO-NOT-LOGAR failed'
      )
    );

    expect(detail.thrownMessage).not.toContain("AIzaSy");
    expect(detail.thrownMessage).toContain("omitido");
    expect(detail.redacted).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("AIzaSy-SECRET-DO-NOT-LOGAR");
  });

  it.each([
    ["access token de OAuth", "token exchange failed: access_token=ya29.abcdefghijklmnop"],
    ["refresh token", "invalid_grant: refresh_token=1//0gSECRETvalue"],
    ["JWT do Supabase", "AuthApiError: eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxIn0.SIGNATURE"],
    ["service role nova", "failed: sb_secret_abcdefghijklmnop"],
    ["Authorization header", "Bearer ya29.a0AfH6SMBxxxxxxxx"],
  ])("redige %s que apareça na mensagem", (_rotulo, mensagem) => {
    const detail = safeDiagnosticDetail(new Error(mensagem));

    expect(detail.redacted).toBe(true);
    // O segredo não pode sobreviver nem em parte.
    for (const segredo of ["ya29", "1//0g", "eyJhbGciOiJ", "sb_secret_", "H6SMB"]) {
      expect(detail.thrownMessage ?? "").not.toContain(segredo);
    }
  });

  it("mensagem inocente passa intacta (o filtro não pode engolir o diagnóstico)", () => {
    const detalhe = safeDiagnosticDetail(new Error("ECONNREFUSED 127.0.0.1:54321"));
    expect(detalhe.thrownMessage).toBe("ECONNREFUSED 127.0.0.1:54321");
    expect(detalhe.redacted).toBe(false);
  });

  it("valor não-Error não produz detalhe", () => {
    expect(safeDiagnosticDetail("boom")).toEqual({
      code: null,
      googleReason: null,
      thrownMessage: null,
      redacted: false,
    });
  });
});