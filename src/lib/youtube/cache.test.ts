import { describe, expect, it } from "vitest";

import { isCacheFresh, normalizeQuery, SONG_CACHE_TTL_SECONDS } from "./cache";

describe("normalizeQuery", () => {
  it("colapsa espaços, minúsculas, remove acentos e ordena (bucket)", () => {
    expect(normalizeQuery("   Ana Castela    Vai  Dar Namoro  ")).toBe("ana castela dar namoro vai");
  });

  it("remoção de acentos ajuda buscas aproximadas", () => {
    expect(normalizeQuery("CORAÇÃO")).toBe("coracao");
  });

  it("mesmas palavras com ordem diferente geram a mesma chave (bucket)", () => {
    expect(normalizeQuery("kate bush")).toBe(normalizeQuery("bush kate"));
  });

  it("query vazia retorna string vazia", () => {
    expect(normalizeQuery("   ")).toBe("");
    expect(normalizeQuery("!!!")).toBe("");
  });

  it("palavras repetidas e pontuação não viram palavras novas", () => {
    expect(normalizeQuery("Ana ana ?! CASTELA castela 001")).toBe("001 ana castela");
  });

  it("limita o tamanho da chave", () => {
    const longQuery = Array.from({ length: 100 }, (_, i) => "x".repeat(20) + i).join(" ");
    expect(normalizeQuery(longQuery)).toHaveLength(128);
  });
});

describe("isCacheFresh", () => {
  it("recente é fresco", () => {
    expect(isCacheFresh(new Date().toISOString())).toBe(true);
  });

  it("mais velho que o TTL expira", () => {
    const old = new Date(Date.now() - (SONG_CACHE_TTL_SECONDS + 60) * 1000).toISOString();
    expect(isCacheFresh(old)).toBe(false);
  });

  it("data inválida não é fresco", () => {
    expect(isCacheFresh("não é data")).toBe(false);
  });

  it("data futura não é fresco", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isCacheFresh(future)).toBe(false);
  });
});