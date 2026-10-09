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
        fora_do_raio: false,
        distancia_m: 42.5,
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
        fora_do_raio: false,
        distancia_m: 42.5,
        pulseira_exigida: false,
        tem_pulseira: false,
      },
    });
  });

  /**
   * `member_entry_state` passou a devolver a presença gravada no join
   * (migration 00040) porque é ela que diz à página da sala se o espectador
   * entrou de fora — e daí não oferecer mesa.
   */
  it("carrega a presença da entrada para a página não oferecer mesa ao espectador", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "approved",
        mesa_numero: null,
        pre_approval: false,
        approved_at: null,
        fora_do_raio: true,
        distancia_m: 1893.42,
      },
      error: null,
    });

    const result = await getMemberEntryState(ROOM);

    expect(result).toMatchObject({
      ok: true,
      state: { fora_do_raio: true, distancia_m: 1893.42, mesa_numero: null },
    });
  });

  it("normaliza coluna ausente (banco sem a 00040) sem quebrar a tela", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "approved", mesa_numero: 1, pre_approval: false, approved_at: null },
      error: null,
    });

    const result = await getMemberEntryState(ROOM);

    expect(result).toEqual({
      ok: true,
      state: {
        status: "approved",
        mesa_numero: 1,
        pre_approval: false,
        approved_at: null,
        fora_do_raio: false,
        distancia_m: null,
        pulseira_exigida: false,
        tem_pulseira: false,
      },
    });
  });

  /**
   * Fase 18: a MESMA função devolve se a casa exige pulseira e se a pessoa tem
   * a dela ativa. App contra banco antigo cai no `false`/`false` — o default
   * menos restritivo.
   */
  it("carrega a pulseira da casa e se a pessoa tem a dela ativa", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "approved",
        mesa_numero: 2,
        pre_approval: false,
        approved_at: null,
        fora_do_raio: false,
        pulseira_exigida: true,
        tem_pulseira: true,
      },
      error: null,
    });

    const result = await getMemberEntryState(ROOM);

    expect(result).toMatchObject({
      ok: true,
      state: { pulseira_exigida: true, tem_pulseira: true },
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
