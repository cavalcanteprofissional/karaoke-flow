export type RoomEntryMode = "open" | "approval";

export type RoomQueueApprovalMode = "auto" | "manual";

export type RoomStatus = "active" | "closed";

export type MemberStatus = "pending" | "approved" | "rejected";

export type Room = {
  id: string;
  code: string;
  qr_code_url: string | null;
  host_id: string;
  /** Bar (perfil do host) dono desta sala/karaokê. */
  bar_id: string | null;
  entry_mode: RoomEntryMode;
  queue_approval_mode: RoomQueueApprovalMode;
  require_song_confirmation: boolean;
  /**
   * Pré-aprovação de 24h ao reentrar (Fase 8a). Só vale para usuário COM
   * login; anônimo nunca é pré-aprovado. Default ON no banco e travado em ON
   * na UI — o estado OFF existe e funciona, mas o host ainda não pode
   * levá-lo até lá.
   */
  pre_approval_24h: boolean;
  youtube_api_key: string | null;
  status: RoomStatus;
  created_at: string;
};

export type RoomMember = {
  room_id: string;
  user_id: string;
  status: MemberStatus;
  joined_at: string;
  /** Etiqueta da mesa do participante (obrigatória para não-host). */
  mesa_numero: number | null;
  /** Instante da aprovação — base da janela de 24h (derivado por trigger). */
  approved_at?: string | null;
};

export type EntryMembership = Pick<RoomMember, "status" | "mesa_numero">;

/** Retorno de `member_entry_state`: o status EFETIVO para efeitos de entrada. */
export type MemberEntryState = EntryMembership & {
  /** A pré-aprovação de 24h valeu nesta consulta? */
  pre_approval: boolean;
  approved_at: string | null;
};

/** Retorno da RPC `get_room_preview` (lista com 1 item). */
export type RoomPreview = {
  room_id: string;
  code: string;
  host_id: string;
  host_name: string;
  entry_mode: RoomEntryMode;
  status: RoomStatus;
};

export const ROOM_ENTRY_MODES = ["open", "approval"] as const;

export const ROOM_QUEUE_MODES = ["auto", "manual"] as const;

export const ROOM_STATUSES = ["active", "closed"] as const;
