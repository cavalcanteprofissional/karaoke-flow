import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAppUrl } from "@/lib/app-url";

/**
 * A ordem aqui é o contrato: origem real do cliente primeiro, env depois.
 * Inverter essas camadas é o que fazia o QR de um preview da Vercel apontar
 * para a produção.
 */
describe("resolveAppUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalEnv;
    vi.unstubAllGlobals();
  });

  it("prefere a origem real à env quando roda no cliente", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://producao.vercel.app";
    // Sem stubbing, o jsdom expõe `window` e `resolveAppUrl()` devolve o
    // origin — que é exatamente a comportamento desejado no cliente.
    expect(resolveAppUrl()).toBe(window.location.origin);
    expect(resolveAppUrl()).not.toContain("producao.vercel.app");
  });

  it("cai na env no servidor, onde não existe window", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://producao.vercel.app/";
    vi.stubGlobal("window", undefined);
    expect(resolveAppUrl()).toBe("https://producao.vercel.app");
  });

  it("usa localhost quando não há env nem window (dev sem configurar)", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.stubGlobal("window", undefined);
    expect(resolveAppUrl()).toBe("http://localhost:3000");
  });

  it("uma base explícita ganha de tudo, inclusive do origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://producao.vercel.app";
    expect(resolveAppUrl("https://exemplo.com")).toBe("https://exemplo.com");
  });

  it("normaliza barra final e espaços", () => {
    expect(resolveAppUrl("  https://exemplo.com///  ")).toBe("https://exemplo.com");
  });

  it("ignora base vazia e devolve o origin", () => {
    expect(resolveAppUrl("")).toBe(window.location.origin);
    expect(resolveAppUrl("   ")).toBe(window.location.origin);
    expect(resolveAppUrl(null)).toBe(window.location.origin);
    expect(resolveAppUrl(undefined)).toBe(window.location.origin);
  });

  it("preserva subpath explícito (preview com path base)", () => {
    expect(resolveAppUrl("https://exemplo.com/app/")).toBe("https://exemplo.com/app");
  });
});
