import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

/**
 * O bug reportado: `/entrar?code=ABC123` sem sessão recebia `307` para
 * `/login` e o `?code=` morria no redirect — o visitante tinha que escanear o
 * QR de novo. Estes testes existem para travar o round-trip inteiro.
 */
const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser },
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  })),
}));

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

const ANONYMOUS = {
  is_anonymous: true,
  app_metadata: { is_anonymous: true },
};

describe("proxy — sem sessão", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });
  });

  it("carrega o ?code= da sala para dentro do next, em vez de descartar", async () => {
    const res = await proxy(request("/entrar?code=ABC123"));
    const location = new URL(res.headers.get("location")!);

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/entrar?code=ABC123");
  });

  it("não deixa a query original vazar junto no /login", async () => {
    const res = await proxy(request("/entrar?code=ABC123"));
    const location = new URL(res.headers.get("location")!);

    // A query foi MOVIDA para o next; se ficasse também solta, o /login
    // carregaria `?code=…&next=…` e o parâmetro viraria isca.
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("preserva bar e mesa do QR de mesa", async () => {
    const res = await proxy(request("/entrar?bar=XED123&mesa=7"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe(
      "/entrar?bar=XED123&mesa=7"
    );
  });

  it("preserva o caminho de uma sala protegida", async () => {
    const res = await proxy(request("/salas/KARAOKE"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe(
      "/salas/KARAOKE"
    );
  });

  it("não cria next quando não havia query", async () => {
    const res = await proxy(request("/dashboard"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe(
      "/dashboard"
    );
  });

  it("deixa rota pública passar direto", async () => {
    const res = await proxy(request("/player/ABC123"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("proxy — já autenticado", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: ANONYMOUS } });
  });

  it("segue o next quando o próprio proxy mandou para o login", async () => {
    const res = await proxy(request("/login?next=%2Fentrar%3Fcode%3DABC123"));
    const location = new URL(res.headers.get("location")!);

    expect(location.pathname).toBe("/entrar");
    expect(location.searchParams.get("code")).toBe("ABC123");
  });

  it("rejeita next fora do domínio em vez de redirecionar para fora", async () => {
    const res = await proxy(request("/login?next=%2F%2Fevil.com"));
    const location = new URL(res.headers.get("location")!);

    // `//evil.com` é resolvido pelo browser como URL absoluta: sem a validação,
    // o login viraria um redirecionador aberto.
    expect(location.host).toBe("localhost:3000");
    expect(location.pathname).toBe("/entrar");
  });

  it("rejeita next em URL absoluta", async () => {
    const res = await proxy(request("/login?next=https%3A%2F%2Fevil.com"));
    expect(new URL(res.headers.get("location")!).host).toBe("localhost:3000");
  });

  it("sem next, anônimo vai para /entrar e a query é limpa", async () => {
    const res = await proxy(request("/login?error=falhou"));
    const location = new URL(res.headers.get("location")!);

    expect(location.pathname).toBe("/entrar");
    expect(location.search).toBe("");
  });

  it("host autenticado sem next vai para /dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", app_metadata: {} } } });
    const res = await proxy(request("/login"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("host autenticado também segue o next válido", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", app_metadata: {} } } });
    const res = await proxy(request("/login?next=%2Fentrar%3Fbar%3DXED123"));
    const location = new URL(res.headers.get("location")!);

    expect(location.pathname).toBe("/entrar");
    expect(location.searchParams.get("bar")).toBe("XED123");
  });
});
