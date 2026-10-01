import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateYoutubeKeyAction } from "./actions";

/**
 * A escrita da chave de API do YouTube depois da `20260930000038` (Fase 8c·C,
 * F1 da auditoria de RLS).
 *
 * O que estes testes travam: a action **não** pode voltar a ser
 * `update rooms set youtube_api_key`. A coluna saiu do alcance do papel
 * `authenticated` por ACL de coluna, então qualquer escrita por Data API
 * quebraria com `permission denied` — mas o pior não é o erro, é a tentação de
 * "consertar" com `createAdmin()`, que reabria a porta que a auditoria fechou
 * (o service role passa por cima da RLS e escreveria a chave de qualquer sala).
 * O caminho é a RPC `admin_set_room_youtube_api_key`, que valida o vínculo
 * dentro do banco.
 *
 * O segundo ponto é o **contrato de retorno**: a RPC devolve `boolean`, não
 * linhas. A versão anterior checava `!data || data.length === 0`, que por
 * acaso funciona para booleano (`!data` pega o `false`, o `true` passa) — e é
 * exatamente esse acidente que é perigoso: se alguém "simplificar" para
 * `data.length === 0`, o `false` de uma escrita recusada dá
 * `undefined === 0` → falso → a action diria "gravado" para uma recusa. O `!== true`
 * explícito abaixo é o que torna o contrato legível.
 */
const ROOM = "22222222-2222-4222-8222-222222222222";
const KEY = "AIzaSy_EXEMPLO_NAO_E_REAL_1234567890";

type RpcResult = { data: unknown; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  rpcResult: { data: true, error: null } as RpcResult,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  fromCalls: [] as { op: string; table: string }[],
  revalidate: [] as string[],
  adminCalls: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    mocks.revalidate.push(String(path));
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => new Map() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      mocks.calls.push({ name, args });
      return Promise.resolve(mocks.rpcResult);
    },
    // Qualquer tentativa de tocar a tabela direto é registrada: o teste abaixo
    // afirma que ela NÃO acontece.
    from: (table: string) => {
      mocks.fromCalls.push({ op: "from", table });
      throw new Error(`acesso direto a ${table} não deveria existir nesta action`);
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdmin: () => {
    mocks.adminCalls.push("createAdmin");
    throw new Error("createAdmin não deveria ser usado para escrever a chave");
  },
}));

beforeEach(() => {
  mocks.rpcResult = { data: true, error: null };
  mocks.calls.length = 0;
  mocks.fromCalls.length = 0;
  mocks.adminCalls.length = 0;
  mocks.revalidate.length = 0;
});

describe("updateYoutubeKeyAction", () => {
  it("grava pela RPC host-only, sem passar pela tabela", async () => {
    const result = await updateYoutubeKeyAction(ROOM, KEY);

    expect(result).toEqual({ ok: true });
    expect(mocks.calls).toEqual([
      { name: "admin_set_room_youtube_api_key", args: { p_room_id: ROOM, p_api_key: KEY } },
    ]);
    expect(mocks.fromCalls).toEqual([]);
    expect(mocks.adminCalls).toEqual([]);
  });

  it("aparenta o espaço antes de gravar (a chave vai para o banco, não para o log)", async () => {
    await updateYoutubeKeyAction(ROOM, `  ${KEY}\n`);

    expect(mocks.calls[0].args.p_api_key).toBe(KEY);
  });

  it("espaço em branco apaga a chave em vez de gravar lixo", async () => {
    await updateYoutubeKeyAction(ROOM, "   ");

    expect(mocks.calls[0].args.p_api_key).toBeNull();
  });

  it("null apaga a chave", async () => {
    await updateYoutubeKeyAction(ROOM, null);

    expect(mocks.calls[0].args.p_api_key).toBeNull();
  });

  it("recusa do banco vira 'só o dono pode configurar'", async () => {
    mocks.rpcResult = { data: false, error: null };

    const result = await updateYoutubeKeyAction(ROOM, KEY);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/dono/i);
    expect(mocks.revalidate).toEqual([]);
  });

  it("erro de permissão do PostgREST não vira mensagem de banco crua", async () => {
    mocks.rpcResult = {
      data: null,
      error: { message: "permission denied for function admin_set_room_youtube_api_key" },
    };

    const result = await updateYoutubeKeyAction(ROOM, KEY);

    expect(result.ok).toBe(false);
    expect(result.error).not.toMatch(/permission denied/i);
    expect(result.error).toMatch(/não foi possível salvar/i);
  });
});
