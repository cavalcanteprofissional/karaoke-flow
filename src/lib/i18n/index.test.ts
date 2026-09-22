import { describe, expect, it } from "vitest";

import { detectLocale, normalizeLocale } from "./index";
import { dictionaries } from "./dictionaries";

describe("normalizeLocale", () => {
  it("mapeia variantes para um Locale suportado", () => {
    expect(normalizeLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeLocale("pt-br")).toBe("pt-BR");
    expect(normalizeLocale("pt")).toBe("pt-BR");
    expect(normalizeLocale("PT")).toBe("pt-BR");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("en-GB")).toBe("en");
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("es-ES")).toBe("es");
    expect(normalizeLocale("es")).toBe("es");
  });

  it("devolve null para idiomas não suportados ou vazios", () => {
    expect(normalizeLocale("fr")).toBe(null);
    expect(normalizeLocale("")).toBe(null);
    expect(normalizeLocale(undefined)).toBe(null);
  });
});

describe("detectLocale", () => {
  it("respeita a ordem de preferência do navegador", () => {
    expect(detectLocale(["fr", "en-US", "pt-BR"])).toBe("en");
    expect(detectLocale(["fr", "es-AR"])).toBe("es");
    expect(detectLocale(["fr", "ja"])).toBe("pt-BR");
  });

  it("usa fallback pt-BR quando nada é suportado", () => {
    expect(detectLocale([])).toBe("pt-BR");
    expect(detectLocale(["ar", "de"])).toBe("pt-BR");
  });
});

describe("dictionaries", () => {
  it("oferece os três idiomas com as chaves da Tela 1", () => {
    for (const dict of Object.values(dictionaries)) {
      expect(typeof dict.onboarding.sing).toBe("string");
      expect(typeof dict.onboarding.host).toBe("string");
      expect(typeof dict.consent.title).toBe("string");
      expect(dict.consent.body.length).toBeGreaterThan(20);
      expect(typeof dict.consent.accept).toBe("string");
    }
  });
});
