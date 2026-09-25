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
};

export type EntryMembership = Pick<RoomMember, "status" | "mesa_numero">;

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
