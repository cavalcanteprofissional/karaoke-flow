import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedHostTokens,
  getHostAccessToken,
  invalidateCachedHostToken,
} from "./host-oauth";

afterEach(() => {
  clearCachedHostTokens();
});

describe("getHostAccessToken", () => {
  it("refresca e retorna o access token quando há refresh_token", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue("refresh-123") };
    const refresher = vi.fn().mockResolvedValue("access-456");
    const token = await getHostAccessToken({ hostId: "host-1", store, refresher });

    expect(token).toBe("access-456");
    expect(store.getRefreshToken).toHaveBeenCalledWith("host-1");
    expect(refresher).toHaveBeenCalledWith("refresh-123");
  });

  it("retorna null sem refresh_token (host não conectou) e não chama o refresher", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue(null) };
    const refresher = vi.fn().mockResolvedValue("access");
    expect(await getHostAccessToken({ hostId: "host-1", store, refresher })).toBeNull();
    expect(refresher).not.toHaveBeenCalled();
  });

  it("sem refresher próprio usa o default (que sem credenciais devolve null)", async () => {
    const store = { getRefreshToken: async () => "refresh" };
    const token = await getHostAccessToken({ hostId: "host-1", store });
    expect(token).toBeNull();
  });

  // ── Cache (Fase 8f) ────────────────────────────────────────────────────────
  it("cacheia por host: o 2º pedido não lê o banco nem refresca", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue("refresh-123") };
    const refresher = vi.fn().mockResolvedValue("access-456");

    await getHostAccessToken({ hostId: "host-1", store, refresher });
    const second = await getHostAccessToken({ hostId: "host-1", store, refresher });

    expect(second).toBe("access-456");
    // O round-trip que a Fase 4 fazia em TODA busca.
    expect(store.getRefreshToken).toHaveBeenCalledTimes(1);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  // A chave do cache é o host: sem isso, o token de um bar apareceria na busca
  // de outro quando os dois ids não batessem.
  it("o cache é por host, não global", async () => {
    const store = { getRefreshToken: vi.fn().mockImplementation(async (id: string) => `refresh-${id}`) };
    const refresher = vi.fn().mockImplementation(async (rt: string) => `access-${rt}`);

    const a = await getHostAccessToken({ hostId: "host-a", store, refresher });
    const b = await getHostAccessToken({ hostId: "host-b", store, refresher });
    const aAgain = await getHostAccessToken({ hostId: "host-a", store, refresher });

    expect(a).toBe("access-refresh-host-a");
    expect(b).toBe("access-refresh-host-b");
    expect(aAgain).toBe(a);
  });

  // O in-flight é o que impede o stampede no primeiro acesso / logo após a
  // expiração, que é o pico de tráfego que mais pesa no endpoint de token.
  it("buscas simultâneas do mesmo host geram um único refresh", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue("refresh-123") };
    const refresher = vi.fn().mockResolvedValue("access-456");

    const [a, b, c] = await Promise.all([
      getHostAccessToken({ hostId: "host-1", store, refresher }),
      getHostAccessToken({ hostId: "host-1", store, refresher }),
      getHostAccessToken({ hostId: "host-1", store, refresher }),
    ]);

    expect([a, b, c]).toEqual(["access-456", "access-456", "access-456"]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  // Uma falha não pode prender o host: sem o `finally`, a entrada in-flight
  // ficaria para sempre e a busca seguinte receberia o erro antigo.
  it("falha no refresh não trava o host para as próximas buscas", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue("refresh-123") };
    const refresher = vi.fn().mockRejectedValueOnce(new Error("rede"));

    await expect(getHostAccessToken({ hostId: "host-1", store, refresher })).rejects.toThrow("rede");

    refresher.mockResolvedValueOnce("access-456");
    expect(await getHostAccessToken({ hostId: "host-1", store, refresher })).toBe("access-456");
  });

  // Só cacheia quando houve token: guardar `null` faria o bar com OAuth
  // desconectado pagar uma leitura ao banco em toda busca para receber o mesmo
  // "não conectou".
  it("não cacheia ausência de token", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue(null) };
    const refresher = vi.fn().mockResolvedValue("access");

    await getHostAccessToken({ hostId: "host-1", store, refresher });
    await getHostAccessToken({ hostId: "host-1", store, refresher });

    expect(store.getRefreshToken).toHaveBeenCalledTimes(2);
  });
  // ── Invalidação (Fase 8f) ──────────────────────────────────────────────────
  // Sem isto, o cache de 55 min sobrevive à desconexão: o dono revoga a conta
  // no Google e o bar dele continua buscando com o access token antigo. É o
  // caso que faz o botão "desconectar" parecer não ter efeito.
  it("desconectar invalida o cache: a busca seguinte relê o banco", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue("refresh-123") };
    const refresher = vi.fn().mockResolvedValue("access-456");

    await getHostAccessToken({ hostId: "host-1", store, refresher });

    // O dono desconecta: a linha some, e o token é revogado no Google.
    store.getRefreshToken.mockResolvedValue(null);
    invalidateCachedHostToken("host-1");

    expect(await getHostAccessToken({ hostId: "host-1", store, refresher })).toBeNull();
    // E o banco foi mesmo relido — sem a invalidação, viraria null sem consultar.
    expect(store.getRefreshToken).toHaveBeenCalledTimes(2);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it("reconectar troca o token em uso (não serve o token da conta antiga)", async () => {
    const store = { getRefreshToken: vi.fn().mockResolvedValue("refresh-conta-antiga") };
    const refresher = vi.fn().mockResolvedValue("access-conta-antiga");

    await getHostAccessToken({ hostId: "host-1", store, refresher });

    // Callback de reconexão: nova conta, novo refresh_token.
    store.getRefreshToken.mockResolvedValue("refresh-conta-nova");
    refresher.mockResolvedValueOnce("access-conta-nova");
    invalidateCachedHostToken("host-1");

    expect(await getHostAccessToken({ hostId: "host-1", store, refresher })).toBe("access-conta-nova");
  });

  it("invalidate é por host: não derruba o token de outro bar", async () => {
    const store = { getRefreshToken: vi.fn(async (hostId: string) => `refresh-${hostId}`) };
    const refresher = vi.fn(async (refreshToken: string) => `access-${refreshToken}`);

    await getHostAccessToken({ hostId: "host-1", store, refresher });
    await getHostAccessToken({ hostId: "host-2", store, refresher });

    invalidateCachedHostToken("host-1");

    await getHostAccessToken({ hostId: "host-1", store, refresher });
    await getHostAccessToken({ hostId: "host-2", store, refresher });

    // host-1 relê; host-2 continua vindo do cache.
    expect(store.getRefreshToken).toHaveBeenCalledTimes(3);
    expect(refresher).toHaveBeenCalledTimes(3);
  });

  it("invalidate também descarta um refresh em andamento", async () => {
    // O host entra em trânsito no momento da desconexão: o refresh started antes
    // do `delete` e resolve depois. A entrada in-flight não pode sobreviver à
    // invalidação, senão a próxima busca herdaria o token pré-desconexão.
    let sinalizarChamada: () => void = () => {};
    const chamaramRefresh = new Promise<void>((resolve) => {
      sinalizarChamada = resolve;
    });
    let liberar: (valor: string) => void = () => {};

    const store = { getRefreshToken: vi.fn().mockResolvedValue("refresh-123") };
    const refresher = vi.fn(() => {
      sinalizarChamada();
      return new Promise<string>((resolve) => {
        liberar = resolve;
      });
    });

    const pendente = getHostAccessToken({ hostId: "host-1", store, refresher });
    await chamaramRefresh;

    invalidateCachedHostToken("host-1");
    liberar("access-antigo");
    await pendente;

    // Sem a limpeza do in-flight, a busca seguinte herdaria a promise antiga e
    // devolveria o token que o dono revogou.
    store.getRefreshToken.mockResolvedValue(null);
    expect(await getHostAccessToken({ hostId: "host-1", store, refresher })).toBeNull();
  });
});
