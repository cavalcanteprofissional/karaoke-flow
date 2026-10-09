import type { RoomEntryMode, RoomStatus } from "@/types/room";

/** Bar = perfil-personificação do host (1:1 com auth.users). */
export type Bar = {
  id: string;
  host_id: string;
  code: string;
  nome: string;
  cidade: string | null;
  endereco: string | null;
  quantidade_mesas: number;
  latitude: number | null;
  longitude: number | null;
  raio_permitido_metros: number;
  /** Interruptor mestre da pulseira (Fase 18) — herdado pelo `get_entry_preview`. */
  pulseiras_ativadas: boolean;
  criado_em: string;
};

/**
 * Faixa de valor da pulseira (`pulseiras_precos`): dia da semana e janela de
 * horário em que vale (intervalo semiaberto [início, fim)). O cartaz respeita
 * o fuso de São Paulo (`America/Sao_Paulo`) na hora de dizer "hoje".
 */
export type PulseiraPreco = {
  id: string;
  bar_id: string;
  /** 0=domingo … 6=sábado (mesmo `dow` do `extract`). */
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  preco_centavos: number;
};

/** Linha crua de `pulseiras_codigos` — o que a tela do host lista. */
export type PulseiraCodeRow = {
  id: string;
  bar_id: string;
  codigo: string;
  criado_em: string;
  expira_em: string;
  usado_por: string | null;
  usado_em: string | null;
};

/** O código impresso está: disponível para usar, já usado (morto) ou vencido. */
export type PulseiraStatus = "disponivel" | "usado" | "expirado";

/** Teto do lote por clique (mesmo check da RPC `gerar_pulseiras`). */
export const PULSEIRA_LOTE_MAX = 100;
/** Quantidade que o host pede por padrão. */
export const PULSEIRA_LOTE_PADRAO = 10;
/** Validade do código E do acesso resgatado (nascem juntos, 24h). */
export const PULSEIRA_DURACAO_HORAS = 24;

/**
 * Faixa de valores é um CARTÁVEL (decisão da Fase 18): começando vazia, o
 * resgate funciona sem cobrança. Referência para a UI marcar "hoje".
 */
export const DIAS_SEMANA: readonly string[] = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

/** Mesa = etiqueta do bar (1..N), sem função além de identificar. */
export type Mesa = {
  id: string;
  bar_id: string;
  numero: number;
  rotulo: string | null;
  criado_em: string;
};

/**
 * Retorno da RPC `get_entry_preview` (fila única; mesa opcional).
 * `p_code` da RPC aceita código de BAR ou de room (QR legado de sala).
 */
export type EntryBarPreview = {
  bar_id: string;
  bar_code: string;
  bar_nome: string;
  bar_cidade: string | null;
  quantidade_mesas: number;
  bar_latitude: number | null;
  bar_longitude: number | null;
  bar_raio_permitido_metros: number;
  /** Interruptor mestre da pulseira (Fase 18) — herdado pelo `get_entry_preview`. */
  pulseiras_ativadas: boolean;
  room_id: string;
  room_code: string;
  host_id: string;
  host_name: string;
  entry_mode: RoomEntryMode;
  status: RoomStatus;
  mesa_numero: number | null;
  mesa_rotulo: string | null;
};

/** Resultado do fluxo de entrada (preview + escolha da mesa). */
export type EntryScreen = {
  preview: EntryBarPreview;
  mesa: number;
};

/** Limite do produto (Fase 16): 1 por padrão, até 10 — mesmo `check` do banco. */
export const MESA_MAX = 10;

/**
 * Raio de presença do bar (`bars.raio_permitido_metros`) — mesmo `check` do
 * banco (migration `20260923000015_bars_geo.sql`), em uma fonte só para a UI.
 */
export const RAIO_MIN_METROS = 50;
export const RAIO_MAX_METROS = 1000;
export const RAIO_PADRAO_METROS = 500;
/** Granularidade do controle do host (slider e input). */
export const RAIO_PASSO_METROS = 50;