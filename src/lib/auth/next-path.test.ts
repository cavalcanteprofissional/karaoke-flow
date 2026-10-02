import { describe, expect, it } from "vitest";

import { safeNextPath, splitNextPath } from "@/lib/auth/next-path";

/**
 * `next` é controlado por quem constrói o link — e o link pode ser colado à mão
 * ou chegar num e-mail. Sem estas regras, `//evil.com` e `https://evil.com`
 * viram URL absoluta no navegador e o login vira um redirecionador aberto.
 */
describe("safeNextPath", () => {
  it("aceita caminho interno com query", () => {
    expect(safeNextPath("/entrar?code=ABC123", "/dashboard")).toBe("/entrar?code=ABC123");
  });

  it("preserva o código do QR pela query", () => {
    expect(safeNextPath("/entrar?bar=XED123&mesa=7", "/entrar")).toBe(
      "/entrar?bar=XED123&mesa=7"
    );
  });

  it("recusa protocolo-relativo (//host)", () => {
    expect(safeNextPath("//evil.com/steal", "/dashboard")).toBe("/dashboard");
  });

  it("recusa URL absoluta", () => {
    expect(safeNextPath("https://evil.com", "/dashboard")).toBe("/dashboard");
    expect(safeNextPath("http://evil.com", "/dashboard")).toBe("/dashboard");
  });

  it("recusa esquema exótico", () => {
    expect(safeNextPath("javascript:alert(1)", "/dashboard")).toBe("/dashboard");
  });

  it("recusa caminho relativo, que sairia do domínio na resolução", () => {
    expect(safeNextPath("evil.com", "/dashboard")).toBe("/dashboard");
  });

  it("usa o fallback quando não há valor", () => {
    expect(safeNextPath(null, "/entrar")).toBe("/entrar");
    expect(safeNextPath(undefined, "/entrar")).toBe("/entrar");
    expect(safeNextPath("", "/entrar")).toBe("/entrar");
  });

  it("aceita fallback nulo (quem só quer saber se há next)", () => {
    expect(safeNextPath(null, null)).toBeNull();
    expect(safeNextPath("/salas/ABC", null)).toBe("/salas/ABC");
    expect(safeNextPath("//evil.com", null)).toBeNull();
  });
});

describe("splitNextPath", () => {
  it("separa pathname e query", () => {
    expect(splitNextPath("/entrar?code=ABC123")).toEqual({
      pathname: "/entrar",
      search: "?code=ABC123",
    });
  });

  it("não duplica a interrogação", () => {
    const { pathname, search } = splitNextPath("/entrar?code=A?B");
    expect(pathname).toBe("/entrar");
    expect(search).toBe("?code=A?B");
  });

  it("devolve query vazia quando não há", () => {
    expect(splitNextPath("/dashboard")).toEqual({ pathname: "/dashboard", search: "" });
  });

  it("separa no primeiro `?`", () => {
    expect(splitNextPath("/entrar?a=1?b=2")).toEqual({
      pathname: "/entrar",
      search: "?a=1?b=2",
    });
  });
});
