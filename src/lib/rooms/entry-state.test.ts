import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMemberEntryState } from "./entry-state";

/**
 * A tela de entrada NÃO pode ler `room_members` direto: quem decide o status
 * efetivo é `member_entry_state` no banco (a mesma função que o `join_room`
 * usa para gravar). Se a RPC falhar, o app tem que saber — devolver "sem
 * membership" seria devolver uma pré-aprovação falsa.
 */
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: (...args: unknown[]) => mocks.rpc(...args) }),
}));

const ROOM = "10000000-0000-0000-0000-000000000001";

beforeEach(() => {
  mocks.rpc.mockReset();
});

describe("getMemberEntryState", () => {
  it("devolve o status efetivo com a marca da pré-aprovação", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "approved",
        mesa_numero: 3,
        pre_approval: true,
        approved_at: "2026-09-27T10:00:00Z",
      },
      error: null,
    });

    const result = await getMemberEntryState(ROOM);

    expect(mocks.rpc).toHaveBeenCalledWith("member_entry_state", { p_room_id: ROOM });
    expect(result).toEqual({
      ok: true,
      state: {
        status: "approved",
        mesa_numero: 3,
        pre_approval: true,
        approved_at: "2026-09-27T10:00:00Z",
      },
    });
  });

  it("pré-aprovação vencida volta como pending (o que o banco decidiu)", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "pending",
        mesa_numero: 3,
        pre_approval: false,
        approved_at: "2026-09-25T10:00:00Z",
      },
      error: null,
    });

    const result = await getMemberEntryState(ROOM);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("deveria funcionar");
    expect(result.state?.status).toBe("pending");
    expect(result.state?.pre_approval).toBe(false);
  });

  it("null = nunca entrou (o join decide pela regra da sala)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    expect(await getMemberEntryState(ROOM)).toEqual({ ok: true, state: null });
  });

  it("erro da RPC vira erro explícito, nunca membership vazio", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "row-level security violation" },
    });

    const result = await getMemberEntryState(ROOM);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("deveria falhar");
    expect(result.code).toBe("RLS_BLOCKED");
  });

  it("payload sem status é erro, não aprovação implícita", async () => {
    mocks.rpc.mockResolvedValue({ data: { mesa_numero: 2 }, error: null });

    const result = await getMemberEntryState(ROOM);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("deveria falhar");
    expect(result.code).toBe("ENTRY_STATE_INVALID");
  });
});
