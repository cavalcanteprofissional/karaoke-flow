import { describe, expect, it } from "vitest";

import { classifyYouTubeError } from "./errors";

/**
 * A Fase 8f nasce da produção dizer quatro causas diferentes com o mesmo texto.
 * Estes testes existem para travar o `reason` → código de cada uma delas; se
 * alguém acrescentar um regex novo, a intenção precisa ficar explícita aqui.
 */
describe("classifyYouTubeError", () => {
  /**
   * O MOTOR REAL da Fase 8f, e não um exemplo inventado.
   *
   * Em 05/10/2026 a chave que estava na Production da Vercel (criada havia 198
   * dias, e diferente da que funcionava em `localhost`) foi sondada sem
   * `Referer`, como o servidor faz. A resposta foi:
   *
   *   HTTP 400 · errors[0].reason = "badRequest" · domain = "global"
   *   message = "API key not valid. Please pass a valid API key."
   *
   * Foi esse payload que produziu o 502 sem causa do relato. Dois motivos para
   * o teste existir: (a) o `reason` aqui é `badRequest`, que **não** está em
   * nenhum regex — a classificação depende da mensagem ter sido lida junto, e
   * isso é frágil contra a próxima mudança de texto do Google; (b) o `reason`
   * genérico não pode "vazar" para `UNKNOWN` quando a mensagem é específica.
   */
  it("a chave inválida do deploy (reason badRequest) sai como KEY_INVALID, não UNKNOWN", () => {
    const result = classifyYouTubeError({
      reason: "badRequest",
      message: "API key not valid. Please pass a valid API key.",
      httpStatus: 400,
    });

    expect(result.code).toBe("KEY_INVALID");
    // O passo tem que levar o dono a criar uma chave nova — não a "tentar de novo".
    expect(result.hint).toBeTruthy();
    // 502 e não 503: quem recusou foi o Google (resposta 400 dele), e o `code`
    // é que diz ao cliente de quem é a culpa. `503` fica reservado para
    // `SERVER_MISCONFIGURED`, que é ambiente do NOSSO servidor.
    expect(result.status).toBe(502);
  });

  it("mesma recusa sem a mensagem (só o reason genérico) não pode virar KEY_INVALID", () => {
    // O contrapeso do teste acima: se o `reason` é `badRequest` e a mensagem não
    // diz nada, a resposta honesta é `UNKNOWN`. Promover `badRequest` a
    // "chave inválida" no reason seria adivinhação — e a tela passaria a culpar
    // a chave do dono por um erro que pode ser qualquer coisa.
    const result = classifyYouTubeError({
      reason: "badRequest",
      message: "",
      httpStatus: 400,
    });

    expect(result.code).toBe("UNKNOWN");
  });

  it("quota diária do projeto", () => {
    const result = classifyYouTubeError({
      reason: "dailyLimitExceeded",
      message: "Daily Limit Exceeded",
      httpStatus: 403,
    });
    expect(result.code).toBe("QUOTA_EXHAUSTED");
    expect(result.friendly).toContain("cota");
    expect(result.hint).toBeTruthy();
    expect(result.status).toBe(502);
  });

  it("quota do projeto (reason quotaExceeded)", () => {
    const result = classifyYouTubeError({
      reason: "quotaExceeded",
      message: "The quota for the project was exceeded.",
      httpStatus: 403,
    });
    expect(result.code).toBe("QUOTA_EXHAUSTED");
  });

  it("rate limit transitório vira 429, não 502", () => {
    const result = classifyYouTubeError({
      reason: "rateLimitExceeded",
      message: "Rate Limit Exceeded",
      httpStatus: 403,
    });
    expect(result.code).toBe("RATE_LIMITED_BY_YOUTUBE");
    expect(result.status).toBe(429);
    // Nada a fazer do lado do dono: repetir é o conserto.
    expect(result.hint).toBeNull();
  });

  it("restrição de origem/IP → KEY_RESTRICTED (o caso da Vercel)", () => {
    const result = classifyYouTubeError({
      reason: "ipRefererBlocked",
      message: "Requests from referer <empty> are blocked.",
      httpStatus: 400,
    });
    expect(result.code).toBe("KEY_RESTRICTED");
    // O passo cita o Google Cloud porque a correção é lá, não no app.
    expect(result.hint).toContain("Google Cloud");
  });

  it("referer blocked escrito de outro jeito ainda casa", () => {
    const result = classifyYouTubeError({
      reason: "refererRestrictionViolation",
      message: "",
      httpStatus: 403,
    });
    expect(result.code).toBe("KEY_RESTRICTED");
  });

  it("API não habilitada no projeto", () => {
    const result = classifyYouTubeError({
      reason: "accessNotConfigured",
      message: "Access Not Configured. The API is not enabled for your project.",
      httpStatus: 403,
    });
    expect(result.code).toBe("API_NOT_ENABLED");
    expect(result.hint).toContain("YouTube Data API v3");
  });

  it("escopo insuficiente no OAuth", () => {
    const result = classifyYouTubeError({
      reason: "insufficientPermissions",
      message: "Request had insufficient authentication scopes.",
      httpStatus: 403,
    });
    expect(result.code).toBe("SCOPES_INSUFFICIENT");
    expect(result.hint).toContain("Reconecte");
  });

  it("chave inválida", () => {
    const result = classifyYouTubeError({
      reason: "keyInvalid",
      message: "API key not valid. Please pass a valid API key.",
      httpStatus: 400,
    });
    expect(result.code).toBe("KEY_INVALID");
    expect(result.hint).toContain("Google Cloud");
  });

  // A mensagem do Google muda de redação; o `reason` é o campo estável. Este
  // caso prova que o caminho é o inverso — só a mensagem, `reason` nulo.
  it("sem reason, a mensagem ainda classifica", () => {
    const result = classifyYouTubeError({
      reason: null,
      message: "API key not valid. Please pass a valid API key.",
      httpStatus: 400,
    });
    expect(result.code).toBe("KEY_INVALID");
  });

  it("falha de rede quando não há reason", () => {
    const result = classifyYouTubeError({
      reason: null,
      message: "falha de rede ao falar com o YouTube",
      httpStatus: null,
    });
    expect(result.code).toBe("YOUTUBE_UNREACHABLE");
    expect(result.hint).toBeNull();
  });

  it("429 sem reason usa o Retry-After do header", () => {
    const result = classifyYouTubeError({
      reason: null,
      message: "Too Many Requests",
      httpStatus: 429,
      retryAfterHeader: "42",
    });
    expect(result.code).toBe("RATE_LIMITED_BY_YOUTUBE");
    expect(result.retryAfterSeconds).toBe(42);
  });

  it("causa desconhecida vira UNKNOWN, não texto genérico indistinguível", () => {
    const result = classifyYouTubeError({
      reason: "someNewGoogleReason",
      message: "algo que nunca vimos",
      httpStatus: 500,
    });
    expect(result.code).toBe("UNKNOWN");
    expect(result.status).toBe(502);
  });
});

describe("classifyYouTubeError — rede de segurança", () => {
  // `toFriendlyYouTubeError` saiu: ele recebia só a mensagem, sem `reason`, e
  // era exatamente o que fazia a Fase 4 precisar de dois regex frouxos
  // ("quota" no texto) que acabavam rotulando coisa errada. Todo chamador usa
  // `classifyYouTubeError`, que tem o `reason` e devolve código + passo.

  it("texto sem reason e sem padrão conhecido não inventa causa", () => {
    const result = classifyYouTubeError({
      reason: null,
      message: "algo inesperado",
      httpStatus: 500,
    });
    expect(result.code).toBe("UNKNOWN");
  });
});