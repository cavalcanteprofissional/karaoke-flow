import { describe, expect, it, vi } from "vitest";

import { getHostAccessToken } from "./host-oauth";

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
});