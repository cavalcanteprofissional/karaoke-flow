import type { PulseiraCodeRow, PulseiraPreco, PulseiraStatus } from "@/types/bar";

/**
 * Funções PURAS do domínio de pulseira (Fase 18): o que a UI mostra ("o valor
 * de hoje", "este código já foi usado") sem tocar o banco. A pesada (quem
 * pode cantar) mora no banco — migration `20261008000002` — e esta camada só
 * calcula a mesma leitura para o cartaz e a lista do host.
 */

/** Fuso onde as faixas de valor são interpretadas: o bar é brasileiro. */
export const PULSEIRA_TIMEZONE = "America/Sao_Paulo";

/**
 * Hora de "agora" na casa (fuso de São Paulo): dia da semana em `dow`
 * (0=domingo … 6=sábado) e minuto do dia. Dividir em partes com `Intl` é o
 * jeito estável de converter o instante para o fuso certo sem biblioteca.
 */
export function horaLocalPulseira(
  agora: Date = new Date()
): { dow: number; minutos: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PULSEIRA_TIMEZONE,
    hourCycle: "h23",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(agora);

  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const semana: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dow = semana[valueOf("weekday")] ?? 0;
  const hora = Number(valueOf("hour"));
  const minuto = Number(valueOf("minute"));
  return { dow, minutos: (Number.isFinite(hora) ? hora : 0) * 60 + (Number.isFinite(minuto) ? minuto : 0) };
}

/** "18:00[:SS]" → 1080. Uma fonte só para intérpretes e o app não divergirem. */
export function horaEmMinutos(hora: string): number {
  const [hh, mm] = hora.split(":").map(Number);
  const h = Number.isFinite(hh) ? hh : 0;
  const m = Number.isFinite(mm) ? mm : 0;
  return h * 60 + m;
}

/**
 * O valor da pulseira AGORA: a faixa cuja janela [início, fim) cobre a hora
 * local da casa. Vazio de faixas (ou fora das faixas) devolve `null` — o
 * cartaz fica sem número e o resgate acontece "sem cobrança". Espelha a RPC
 * `preco_vigente` do banco, inclusive o desempate pela faixa que começa mais
 * tarde.
 */
export function precoPulseiraHoje(
  precos: PulseiraPreco[],
  agora: Date = new Date()
): number | null {
  const { dow, minutos } = horaLocalPulseira(agora);
  const abertas = precos
    .filter(
      (p) =>
        p.dia_semana === dow &&
        horaEmMinutos(p.hora_inicio) <= minutos &&
        minutos < horaEmMinutos(p.hora_fim)
    )
    .sort((a, b) => horaEmMinutos(b.hora_inicio) - horaEmMinutos(a.hora_inicio));
  return abertas[0]?.preco_centavos ?? null;
}

/** Estado do código impresso. `usado` vence sempre (código é de uso único). */
export function pulseiraStatus(
  row: PulseiraCodeRow,
  agora: Date = new Date()
): PulseiraStatus {
  if (row.usado_em) return "usado";
  if (new Date(row.expira_em).getTime() <= agora.getTime()) return "expirado";
  return "disponivel";
}

/** "R$ 10,00" a partir de centavos (formato da casa). */
export function formatCentavos(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

/** "18:00:00" → "18:00", para a legenda do cartaz. */
export function formatHora(hora: string): string {
  return hora.split(":").slice(0, 2).join(":");
}

/**
 * Valor digitado em reais → centavos. Aceita "10", "10,50" e "10.50"; vazio ou
 * inválido devolve `null` (a validação do formulário decide a mensagem).
 */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const num = Number(normalizado);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}