import { describe, expect, it } from "vitest";

import {
  canPickMesa,
  canRequestSongs,
  SPECTATOR_QUEUE_NOTICE,
} from "@/lib/rooms/spectator";
import type { MemberEntryState } from "@/types/room";

function membro(over: Partial<MemberEntryState> = {}): MemberEntryState {
  return {
    status: "approved",
    mesa_numero: 3,
    pre_approval: false,
    approved_at: "2026-10-03T12:00:00.000Z",
    fora_do_raio: false,
    distancia_m: 40,
    ...over,
  };
}

describe("regra do espectador", () => {
  it("o dono pode tudo, mesmo sem registro de membro", () => {
    const regra = { isHost: true, membership: null };
    expect(canRequestSongs(regra)).toBe(true);
    expect(canPickMesa(regra)).toBe(true);
  });

  it("quem entrou dentro do raio pede música e escolhe mesa", () => {
    const regra = { isHost: false, membership: membro() };
    expect(canRequestSongs(regra)).toBe(true);
    expect(canPickMesa(regra)).toBe(true);
  });

  it("quem entrou fora do raio não pede música nem escolhe mesa", () => {
    const regra = { isHost: false, membership: membro({ fora_do_raio: true, mesa_numero: null }) };
    expect(canRequestSongs(regra)).toBe(false);
    expect(canPickMesa(regra)).toBe(false);
  });

  /**
   * A regra é do **registro da entrada**, não da posição de agora: o espectador
   * que depois caminhou até o bar continua espectador, porque foi assim que o
   * host o viu no card de ocupação.
   */
  it("o registro manda, não a distância medida agora", () => {
    const regra = {
      isHost: false,
      membership: membro({ fora_do_raio: true, distancia_m: 3 }),
    };
    expect(canRequestSongs(regra)).toBe(false);
    expect(canPickMesa(regra)).toBe(false);
  });

  it("quem não entrou não recebe nada", () => {
    const regra = { isHost: false, membership: null };
    expect(canRequestSongs(regra)).toBe(false);
    expect(canPickMesa(regra)).toBe(false);
  });

  it("quem está pendente de aprovação não recebe nada", () => {
    const regra = {
      isHost: false,
      membership: membro({ status: "pending", mesa_numero: null }),
    };
    expect(canRequestSongs(regra)).toBe(false);
    expect(canPickMesa(regra)).toBe(false);
  });

  /**
   * `fora_do_raio` chega do banco; um app contra banco sem a 00040 devolve a
   * coluna ausente. A direção do erro é "não estou fora" — o mesmo default
   * explícito de `getMemberEntryState`.
   */
  it("sem a coluna de fora do raio, o comportamento é o antigo", () => {
    const semColuna = membro({ fora_do_raio: undefined as unknown as boolean });
    expect(canRequestSongs({ isHost: false, membership: semColuna })).toBe(true);
  });

  it("o aviso do espectador explica a regra, e não a ausência do botão", () => {
    expect(SPECTATOR_QUEUE_NOTICE).toMatch(/fora do raio/i);
    expect(SPECTATOR_QUEUE_NOTICE).toMatch(/não para pedir música/i);
  });
});