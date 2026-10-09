import { describe, expect, it } from "vitest";

import {
  canPickMesa,
  canRequestSongs,
  pulseiraBarrada,
  PULSEIRA_ANON_QUEUE_NOTICE,
  PULSEIRA_QUEUE_NOTICE,
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
    // Casa padrão: pulseira desligada — o membro canta.
    pulseira_exigida: false,
    tem_pulseira: false,
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

describe("regra da pulseira (Fase 18)", () => {
  it("o host é isento mesmo com a casa usando pulseira", () => {
    const regra = {
      isHost: true,
      membership: membro({ pulseira_exigida: true }),
    };
    expect(pulseiraBarrada(regra)).toBe(false);
    expect(canRequestSongs(regra)).toBe(true);
  });

  it("membro aprovado sem pulseira é barrado só no pedido — mesa continua", () => {
    const regra = {
      isHost: false,
      membership: membro({ pulseira_exigida: true, tem_pulseira: false }),
    };
    expect(pulseiraBarrada(regra)).toBe(true);
    expect(canRequestSongs(regra)).toBe(false);
    // A pulseira decide o CANTAR, não o assento: quem parou nela escolhe mesa.
    expect(canPickMesa(regra)).toBe(true);
  });

  it("membro com a pulseira ativa canta normalmente", () => {
    const regra = {
      isHost: false,
      membership: membro({ pulseira_exigida: true, tem_pulseira: true }),
    };
    expect(pulseiraBarrada(regra)).toBe(false);
    expect(canRequestSongs(regra)).toBe(true);
  });

  it("o espectador também não canta — e a mensagem dele tem precedência", () => {
    const regra = {
      isHost: false,
      membership: membro({
        fora_do_raio: true,
        mesa_numero: null,
        pulseira_exigida: true,
      }),
    };
    // `pulseiraBarrada` exige estar DENTRO do raio: o espectador tem causa
    // própria (não canta E não escolhe mesa), e ela não se mistura com a da
    // pulseira — senão a tela trocaria a mensagem certa pela errada.
    expect(pulseiraBarrada(regra)).toBe(false);
    expect(canRequestSongs(regra)).toBe(false);
  });

  it("mensagens: a da casa orienta o balcão/QR; a do anônimo, criar conta", () => {
    expect(PULSEIRA_QUEUE_NOTICE).toMatch(/pulseira/i);
    expect(PULSEIRA_QUEUE_NOTICE).toMatch(/balcão/i);
    expect(PULSEIRA_ANON_QUEUE_NOTICE).toMatch(/crie uma conta/i);
  });
});