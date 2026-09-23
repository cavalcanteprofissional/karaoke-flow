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
  criado_em: string;
};

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

export const MESA_MAX = 999;