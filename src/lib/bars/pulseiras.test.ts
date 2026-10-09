import { describe, expect, it } from "vitest";

import type { PulseiraCodeRow, PulseiraPreco } from "@/types/bar";
import {
  formatCentavos,
  formatHora,
  horaEmMinutos,
  horaLocalPulseira,
  precoPulseiraHoje,
  pulseiraStatus,
  reaisParaCentavos,
} from "./pulseiras";

// Referências com timestrings humanas para os testes não dependerem de TZ da
// máquina nem de biblioteca: os valores são o que a migration 00002 grava.
// São Paulo é UTC-3: sexta 20:30 em SP = 2026-10-09T23:30Z; sábado 22:00 em SP
// = 2026-10-11T01:00Z.
const SEXTA_20h30_UTC = "2026-10-09T23:30:00.000Z";
const SABADO_22h00_UTC = "2026-10-11T01:00:00.000Z";

describe("horaEmMinutos", () => {
  it("converte HH:MM em minutos do dia", () => {
    expect(horaEmMinutos("00:00")).toBe(0);
    expect(horaEmMinutos("18:00")).toBe(1080);
    expect(horaEmMinutos("23:59")).toBe(1439);
  });

  it("tolera segundos (como o banco grava)", () => {
    expect(horaEmMinutos("18:30:00")).toBe(1110);
  });
});

describe("formatHora", () => {
  it("corta os segundos do formato do banco", () => {
    expect(formatHora("18:30:00")).toBe("18:30");
  });
});

describe("formatCentavos", () => {
  it("formata em reais pt-BR", () => {
    // O Intl usa espaço estreito (não-ASCII) entre R$ e o número; comparar por
    // trecho evita acoplar o teste ao caractere exato da versão da ICU.
    expect(formatCentavos(0)).toContain("0,00");
    expect(formatCentavos(1050)).toContain("10,50");
    expect(formatCentavos(999999)).toContain("9.999,99");
  });
});

describe("reaisParaCentavos", () => {
  it("aceita inteiros, vírgula e ponto", () => {
    expect(reaisParaCentavos("10")).toBe(1000);
    expect(reaisParaCentavos("10,50")).toBe(1050);
    expect(reaisParaCentavos("10.50")).toBe(1050);
  });

  it("rejeita vazio, negativo e não-numérico", () => {
    expect(reaisParaCentavos("")).toBeNull();
    expect(reaisParaCentavos("abc")).toBeNull();
    expect(reaisParaCentavos("-5")).toBeNull();
  });
});

describe("horaLocalPulseira", () => {
  it("interpreta o instante em America/Sao_Paulo", () => {
    // 2026-10-10T03:30Z = sábado 00:30 em SP (UTC-3).
    const { dow, minutos } = horaLocalPulseira(new Date("2026-10-10T03:30:00.000Z"));
    expect(dow).toBe(6); // sábado
    expect(minutos).toBe(30);
  });
});

describe("precoPulseiraHoje", () => {
  const faixa: PulseiraPreco = {
    id: "p1",
    bar_id: "bar",
    dia_semana: 5,
    hora_inicio: "18:00:00",
    hora_fim: "23:00:00",
    preco_centavos: 1500,
  };

  it("vale quando o agora cobre a janela da casa", () => {
    expect(precoPulseiraHoje([faixa], new Date("2026-10-10T00:30:00.000Z"))).toBe(1500);
  });

  it("não vale fora da janela (nem antes, nem depois)", () => {
    expect(precoPulseiraHoje([faixa], new Date("2026-10-09T20:00:00.000Z"))).toBeNull();
    expect(precoPulseiraHoje([faixa], new Date("2026-10-10T06:00:00.000Z"))).toBeNull();
  });

  it("sem faixas o preço é null (resgate sem cobrança)", () => {
    expect(precoPulseiraHoje([], new Date())).toBeNull();
  });

  it("desempata para a faixa que começa mais tarde quando há sobreposição", () => {
    const sobreposta: PulseiraPreco = {
      ...faixa,
      id: "p2",
      hora_inicio: "19:00:00",
      preco_centavos: 2000,
    };
    expect(
      precoPulseiraHoje([faixa, sobreposta], new Date("2026-10-10T00:30:00.000Z"))
    ).toBe(2000);
  });
});

describe("pulseiraStatus", () => {
  const base: PulseiraCodeRow = {
    id: "c1",
    bar_id: "bar",
    codigo: "ABC234",
    criado_em: "2026-10-08T00:00:00.000Z",
    expira_em: "2026-10-09T00:00:00.000Z",
    usado_por: null,
    usado_em: null,
  };
  const agora = new Date("2026-10-08T12:00:00.000Z");

  it("disponível dentro do prazo e sem uso", () => {
    expect(pulseiraStatus(base, agora)).toBe("disponivel");
  });

  it("usado vence sempre, mesmo dentro do prazo (uso único)", () => {
    expect(pulseiraStatus({ ...base, usado_em: "2026-10-08T12:00:00.000Z" }, agora)).toBe(
      "usado"
    );
  });

  it("expirado depois do prazo", () => {
    expect(pulseiraStatus(base, new Date("2026-10-10T00:00:00.000Z"))).toBe("expirado");
  });
});

describe("relógios do domínio conversam entre si", () => {
  it("sexta 20:30 em SP é dow 5 com 1230 minutos", () => {
    const { dow, minutos } = horaLocalPulseira(new Date(SEXTA_20h30_UTC));
    expect({ dow, minutos }).toEqual({ dow: 5, minutos: 1230 });
  });

  it("sábado 22:00 em SP é dow 6 com 1320 minutos (bate com a RPC)", () => {
    const { dow, minutos } = horaLocalPulseira(new Date(SABADO_22h00_UTC));
    expect({ dow, minutos }).toEqual({ dow: 6, minutos: 1320 });
  });
});