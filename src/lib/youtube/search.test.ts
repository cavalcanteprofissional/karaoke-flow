import { describe, expect, it } from "vitest";

import { YouTubeApiError } from "./errors";
import { parseIso8601Duration, searchYouTube } from "./search";

const API_KEY = "AIzaSy-TEST";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function searchPayload(ids: string[]): unknown {
  return {
    items: ids.map((videoId) => ({
      id: { videoId },
      snippet: {
        title: `Música ${videoId}`,
        channelTitle: "Canal Padrão",
        thumbnails: { medium: { url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` } },
      },
    })),
  };
}

describe("parseIso8601Duration", () => {
  it("converte PT3M45S em segundos", () => {
    expect(parseIso8601Duration("PT3M45S")).toBe(225);
  });

  it("converte PT1H2M3S em segundos", () => {
    expect(parseIso8601Duration("PT1H2M3S")).toBe(3723);
  });

  it("aceita só segundos", () => {
    expect(parseIso8601Duration("PT42S")).toBe(42);
  });

  it("retorna null para duração ausente", () => {
    expect(parseIso8601Duration(undefined)).toBeNull();
  });

  it("retorna null para formato inválido", () => {
    expect(parseIso8601Duration("P1D")).toBeNull();
    expect(parseIso8601Duration("42")).toBeNull();
  });
});

describe("searchYouTube", () => {
  it("busca na API, enriquece com duração e retorna resultados tipados", async () => {
    const urls: string[] = [];
    const fetchFn = (input: string | URL | Request) => {
      urls.push(String(input));
      if (String(input).includes("/search")) return Promise.resolve(jsonResponse(searchPayload(["AAA", "BBB"])));
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: "AAA", contentDetails: { duration: "PT3M45S" } },
            { id: "BBB", contentDetails: { duration: "PT5S" } },
          ],
        })
      );
    };

    const results = await searchYouTube({
      query: "  ana castela     vai dar namoro  ",
      apiKey: API_KEY,
      fetchFn,
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      videoId: "AAA",
      title: "Música AAA",
      thumbnailUrl: "https://img.youtube.com/vi/AAA/mqdefault.jpg",
      channelTitle: "Canal Padrão",
      durationSeconds: 225,
    });
    expect(results[1].durationSeconds).toBe(5);

    const searchUrl = urls.find((u) => u.includes("/search")) as string;
    expect(searchUrl).toContain("safeSearch=strict");
    expect(searchUrl).toContain("videoEmbeddable=true");
    expect(searchUrl).toContain(`key=${API_KEY}`);
    expect(searchUrl).toContain("q=");
  });

  it("query vazia retorna [] sem tocar na rede", async () => {
    const fetchFn = () => {
      throw new Error("não deveria chamar a rede");
    };
    await expect(searchYouTube({ query: "   ", apiKey: API_KEY, fetchFn })).resolves.toEqual([]);
  });

  it("sem resultados retorna []", async () => {
    const fetchFn = () => Promise.resolve(jsonResponse({ items: [] }));
    await expect(searchYouTube({ query: "zzz", apiKey: API_KEY, fetchFn })).resolves.toEqual([]);
  });

  it("lança YouTubeApiError com reason de cota quando o YouTube responde 403", async () => {
    const fetchFn = () =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 403,
              message: "quotaExceeded",
              errors: [{ reason: "quotaExceeded" }],
            },
          },
          403
        )
      );

    await expect(searchYouTube({ query: "qualquer", apiKey: API_KEY, fetchFn })).rejects.toMatchObject({
      name: "YouTubeApiError",
      reason: "quotaExceeded",
      code: 403,
    });
  });

  it("falha de rede vira YouTubeApiError", async () => {
    const fetchFn = () => Promise.reject(new Error("network down"));
    const error = await searchYouTube({ query: "qualquer", apiKey: API_KEY, fetchFn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YouTubeApiError);
  });

  it("lotes de duração quebram em 50 por chamada", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `V${String(i).padStart(3, "0")}`);
    let videoCalls = 0;
    const fetchFn = (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/search")) return Promise.resolve(jsonResponse(searchPayload(ids)));
      videoCalls += 1;
      const idsInCall = new URL(url).searchParams.get("id")?.split(",") ?? [];
      return Promise.resolve(
        jsonResponse({
          items: idsInCall.map((id) => ({ id, contentDetails: { duration: "PT1M" } })),
        })
      );
    };

    const results = await searchYouTube({ query: "lote", apiKey: API_KEY, fetchFn });
    expect(results).toHaveLength(120);
    expect(videoCalls).toBe(3);
    expect(results[119].durationSeconds).toBe(60);
  });
});