import { describe, expect, it } from "vitest";

import { entryRoute, parseEntryToken } from "./qr";
import { createBarSchema } from "./schema";

describe("parseEntryToken", () => {
  it("aceita código puro de 6 chars (pode ser bar ou sala)", () => {
    expect(parseEntryToken("ZEHBAR")).toEqual({ roomCode: "ZEHBAR" });
    expect(parseEntryToken("  karaok ")).toEqual({ roomCode: "KARAOK" });
  });

  it("interpreta URL com bar+mesa", () => {
    expect(parseEntryToken("https://karaoke.app/entrar?bar=ZEHBAR&mesa=3")).toEqual({
      bar: "ZEHBAR",
      mesa: 3,
    });
  });

  it("interpreta URL só com bar (sem mesa)", () => {
    expect(parseEntryToken("https://karaoke.app/entrar?bar=ZEHBAR")).toEqual({
      bar: "ZEHBAR",
    });
  });

  it("mantém compatibilidade com QR legado de sala (?code=)", () => {
    expect(parseEntryToken("https://karaoke.app/entrar?code=KARAOK")).toEqual({
      roomCode: "KARAOK",
    });
  });

  it("ignora mesa inválida (fora do range)", () => {
    expect(parseEntryToken("https://karaoke.app/entrar?bar=ZEHBAR&mesa=0")).toEqual({
      bar: "ZEHBAR",
    });
    expect(parseEntryToken("https://karaoke.app/entrar?bar=ZEHBAR&mesa=abc")).toEqual({
      bar: "ZEHBAR",
    });
  });

  it("ignora URLs fora de /entrar, texto aleatório e códigos inválidos", () => {
    expect(parseEntryToken("https://example.com/x")).toBeNull();
    expect(parseEntryToken("apenas um texto")).toBeNull();
    expect(parseEntryToken("https://karaoke.app/entrar?bar=AB")).toBeNull();
    expect(parseEntryToken("https://karaoke.app/entrar?bar=ZEHBAR&mesa=5000")).toEqual({
      bar: "ZEHBAR",
    });
  });
});

describe("entryRoute", () => {
  it("monta rota de bar com mesa", () => {
    expect(entryRoute({ bar: "ZEHBAR", mesa: 3 })).toBe("/entrar?bar=ZEHBAR&mesa=3");
  });

  it("monta rota de bar sem mesa", () => {
    expect(entryRoute({ bar: "ZEHBAR" })).toBe("/entrar?bar=ZEHBAR");
  });

  it("monta rota legada de sala", () => {
    expect(entryRoute({ roomCode: "KARAOK" })).toBe("/entrar?code=KARAOK");
  });
});

describe("createBarSchema", () => {
  it("default de quantidade_mesas é 1 quando ausente", () => {
    const result = createBarSchema.safeParse({
      nome: "Karaokê do Zé",
      cidade: "São Paulo",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantidade_mesas).toBe(1);
      expect(result.data.rotulos).toEqual([]);
    }
  });

  it("aceita quantidade_mesas inteira >= 1", () => {
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", quantidade_mesas: 12 }).success
    ).toBe(true);
  });

  it("rejeita quantidade_mesas < 1 ou > 999", () => {
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", quantidade_mesas: 0 }).success
    ).toBe(false);
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", quantidade_mesas: 1000 }).success
    ).toBe(false);
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", quantidade_mesas: 1.5 }).success
    ).toBe(false);
  });

  it("aceita string numérica em quantidade_mesas (coerce)", () => {
    const result = createBarSchema.safeParse({
      nome: "X",
      cidade: "Y",
      quantidade_mesas: "8",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantidade_mesas).toBe(8);
  });

  it("rejeita nome e cidade vazios", () => {
    expect(createBarSchema.safeParse({ nome: "", cidade: "Y" }).success).toBe(false);
    expect(createBarSchema.safeParse({ nome: "X", cidade: "  " }).success).toBe(false);
  });

  it("aceita rótulos opcionais por mesa", () => {
    const result = createBarSchema.safeParse({
      nome: "X",
      cidade: "Y",
      quantidade_mesas: 2,
      rotulos: ["Mesa da janela", "Mesa do palco"],
    });
    expect(result.success).toBe(true);
  });

  it("endereco opcional pode ser vazio", () => {
    expect(
      createBarSchema.safeParse({
        nome: "X",
        cidade: "Y",
        endereco: "",
      }).success
    ).toBe(true);
  });
});