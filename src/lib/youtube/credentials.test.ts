import { describe, expect, it, vi } from "vitest";

import { resolveYouTubeApiKey } from "./credentials";

describe("resolveYouTubeApiKey", () => {
  it("prioriza a chave do próprio bar (room)", async () => {
    const appToken = vi.fn().mockResolvedValue("app-token");
    const result = await resolveYouTubeApiKey({
      roomKey: "  AIzaSy-BAR  ",
      appToken,
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toEqual({ key: "AIzaSy-BAR", source: "room" });
    expect(appToken).not.toHaveBeenCalled();
  });

  it("usa o token OAuth do app quando não há chave do bar", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: null,
      appToken: async () => "app-token",
      devApiKey: "AIzaSy-DEV",
    });
    expect(result).toEqual({ key: "app-token", source: "app" });
  });

  it("o provedor do app pode falhar, então cai para a chave de dev", async () => {
    const result = await resolveYouTubeApiKey({
      roomKey: "   ",
      appToken: async () => null,
      devApiKey: "  AIzaSy-DEV  ",
    });
    expect(result).toEqual({ key: "AIzaSy-DEV", source: "dev" });
  });

  it("sem appToken ainda usa a chave de dev", async () => {
    const result = await resolveYouTubeApiKey({ roomKey: null, devApiKey: "AIzaSy-DEV" });
    expect(result?.source).toBe("dev");
  });

  it("retorna null quando nada está disponível", async () => {
    await expect(resolveYouTubeApiKey({ roomKey: null, devApiKey: null })).resolves.toBeNull();
    await expect(resolveYouTubeApiKey({ roomKey: "", appToken: async () => null, devApiKey: "" })).resolves.toBeNull();
  });
});