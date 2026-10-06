import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearCachedAdminClient, createAdmin } from "./admin";

/**
 * O memo é por par (URL, chave). Estes testes travam os dois lados: devolver a
 * mesma instância (economia de pool) e NÃO devolver quando a env muda (um
 * singleton travado mandaria requisições para o projeto errado — falha
 * silenciosa, o pior tipo).
 */
beforeEach(() => {
  clearCachedAdminClient();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto-a.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-a");
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearCachedAdminClient();
});

describe("createAdmin", () => {
  it("devolve a mesma instância para a mesma env", () => {
    expect(createAdmin()).toBe(createAdmin());
  });

  it("recria quando a URL muda", () => {
    const first = createAdmin();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto-b.supabase.co");
    expect(createAdmin()).not.toBe(first);
  });

  it("recria quando a service role muda", () => {
    const first = createAdmin();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-b");
    expect(createAdmin()).not.toBe(first);
  });

  it("volta a reaproveitar quando a env volta ao valor original", () => {
    const first = createAdmin();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-b");
    createAdmin();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-a");
    expect(createAdmin()).toBe(first);
  });

  // A exceção precisa continuar explícita: a rota de busca agora a trata como
  // 503 (SERVER_MISCONFIGURED), e é o caso "falta SUPABASE_SERVICE_ROLE_KEY na
  // Vercel" que a produz.
  it("sem credenciais de service role, lança erro nomeado", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => createAdmin()).toThrow(/service role/i);
  });
});