import { describe, expect, it, vi } from "vitest";

import { resolveYouTubeApiKey } from "./credentials";

/**
 * A regra da Fase 8f: os degraus que são do DONO DO PRODUTO (OAuth do app e
 * `YOUTUBE_API_KEY`) só são alcançados por conta `dev`. Os testes abaixo não
 * cobrem só a ordem — cobrem a trava, que é o defeito que trouxe a chave de
 * desenvolvimento para o bar de outra pessoa.
 */
describe("resolveYouTubeApiKey", () => {
  it("prioriza a chave do próprio bar (room)", async () => {
    const appToken = vi.fn().mockResolvedValue("app-token");
    const result = await resolveYouTubeApiKey({
      roomKey: "  AIzaSy-BAR  ",
      isDev: true,
      appToken,
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toEqual({ key: "AIzaSy-BAR", source: "room" });
    expect(appToken).not.toHaveBeenCalled();
  });

  it("usa o token OAuth do host antes do pool da plataforma", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: null,
      hostToken: "host-token",
      platformKey: "pool-key",
      isDev: false,
    });
    expect(result).toEqual({ key: "host-token", source: "host" });
  });

  it("usa a chave do pool da plataforma quando o bar pediu o pool", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: null,
      platformKey: "  pool-key  ",
      isDev: false,
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toEqual({ key: "pool-key", source: "platform" });
  });

  it("usa o token OAuth do app quando não há chave do bar", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: null,
      isDev: true,
      appToken: async () => "app-token",
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toEqual({ key: "app-token", source: "app" });
  });

  it("o provedor do app pode falhar, então cai para a chave de dev", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: "   ",
      isDev: true,
      appToken: async () => null,
      devApiKey: "  AIzaSy-DEV  ",
    });
    expect(result).toEqual({ key: "AIzaSy-DEV", source: "dev" });
  });

  it("sem appToken ainda usa a chave de dev", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: null,
      isDev: true,
      devApiKey: "AIzaSy-DEV",
    });
    expect(result?.source).toBe("dev");
  });

  // ── A trava: o defeito da Fase 8f ──────────────────────────────────────────
  it("NÃO usa a chave de dev para quem não é dev", async () => {
    const appToken = vi.fn().mockResolvedValue("app-token");
    const result = await resolveYouTubeApiKey({
      roomKey: null,
      isDev: false,
      appToken,
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toBeNull();
    expect(appToken).not.toHaveBeenCalled();
  });

  it("sem isDev explícito, a chave de dev é inalcançável (falha fechada)", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: null,
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toBeNull();
  });

  it("a chave do bar continua valendo para quem não é dev", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: "AIzaSy-BAR",
      isDev: false,
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toEqual({ key: "AIzaSy-BAR", source: "room" });
  });

  it("retorna null quando nada está disponível", async () => {
    await expect(resolveYouTubeApiKey({ roomKey: null, devApiKey: null })).resolves.toBeNull();
    await expect(
      resolveYouTubeApiKey({ roomKey: "", isDev: false, appToken: async () => null, devApiKey: "" })
    ).resolves.toBeNull();
  });
});