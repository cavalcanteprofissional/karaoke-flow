import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { barJoinUrl, entryRoute, mesaJoinUrl, parseEntryToken } from "./qr";
import { createBarSchema } from "./schema";

describe("parseEntryToken", () => {
  it("aceita código puro (pode ser bar ou sala, 3–12 chars)", () => {
    expect(parseEntryToken("ZEHBAR")).toEqual({ roomCode: "ZEHBAR" });
    expect(parseEntryToken("  karaok ")).toEqual({ roomCode: "KARAOK" });
    expect(parseEntryToken("KARAOKE")).toEqual({ roomCode: "KARAOKE" });
    expect(parseEntryToken("SALADOZE")).toEqual({ roomCode: "SALADOZE" });
  });

  it("rejeita códigos puros muito curtos ou com caracteres inválidos", () => {
    expect(parseEntryToken("AB")).toBeNull();
    expect(parseEntryToken("KAR OO")).toBeNull();
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

  it("ignora mesa acima do teto do bar (Fase 16: até 10)", () => {
    expect(parseEntryToken("https://karaoke.app/entrar?bar=ZEHBAR&mesa=11")).toEqual({
      bar: "ZEHBAR",
    });
    expect(parseEntryToken("https://karaoke.app/entrar?bar=ZEHBAR&mesa=10")).toEqual({
      bar: "ZEHBAR",
      mesa: 10,
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

  it("aceita quantidade_mesas inteira de 1 a 10 (Fase 16)", () => {
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", quantidade_mesas: 10 }).success
    ).toBe(true);
  });

  it("rejeita quantidade_mesas < 1 ou > 10", () => {
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", quantidade_mesas: 0 }).success
    ).toBe(false);
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", quantidade_mesas: 11 }).success
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

  it("aceita codigo_entrada opcional de 3–12 chars (normaliza para maiúsculas)", () => {
    expect(
      createBarSchema.safeParse({
        nome: "X",
        cidade: "Y",
        codigo_entrada: "karaoke",
      }).success
    ).toBe(true);

    const result = createBarSchema.safeParse({
      nome: "X",
      cidade: "Y",
      codigo_entrada: "karaoke",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.codigo_entrada).toBe("KARAOKE");
  });

  it("rejeita codigo_entrada inválido", () => {
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", codigo_entrada: "AB" }).success
    ).toBe(false);
    expect(
      createBarSchema.safeParse({
        nome: "X",
        cidade: "Y",
        codigo_entrada: "KARAOKE1234ZZZ",
      }).success
    ).toBe(false);
    expect(
      createBarSchema.safeParse({ nome: "X", cidade: "Y", codigo_entrada: "KAR OO" })
        .success
    ).toBe(false);
  });

  it("codigo_entrada vazio vira undefined", () => {
    const result = createBarSchema.safeParse({
      nome: "X",
      cidade: "Y",
      codigo_entrada: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.codigo_entrada).toBeUndefined();
  });
});

describe("URLs de QR usam o host servido, não a env de build", () => {
  // Regressão do QR da TV: `NEXT_PUBLIC_APP_URL` é inlinada em build time, então
  // num preview da Vercel ela apontava para a produção e o QR mandava o visitante
  // para o app errado. O stub prova que a base é o host da página.
  const PREVIEW = "https://karaoke-flow-g5c4txsx6.vercel.app";

  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: PREVIEW } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("barJoinUrl segue o host", () => {
    expect(barJoinUrl("XED123")).toBe(`${PREVIEW}/entrar?bar=XED123`);
  });

  it("mesaJoinUrl segue o host", () => {
    expect(mesaJoinUrl("XED123", 7)).toBe(`${PREVIEW}/entrar?bar=XED123&mesa=7`);
  });

  it("nenhum dos dois vaza localhost:3000 sem base explícita", () => {
    expect(barJoinUrl("XED123")).not.toContain("localhost");
    expect(mesaJoinUrl("XED123", 1)).not.toContain("localhost");
  });

  it("uma base explícita ganha do host", () => {
    expect(barJoinUrl("XED123", "https://producao.vercel.app/")).toBe(
      "https://producao.vercel.app/entrar?bar=XED123"
    );
    expect(mesaJoinUrl("XED123", 2, "https://exemplo.com")).toBe(
      "https://exemplo.com/entrar?bar=XED123&mesa=2"
    );
  });
});
