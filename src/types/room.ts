export type RoomEntryMode = "open" | "approval";

export type RoomQueueApprovalMode = "auto" | "manual";

export type RoomStatus = "active" | "closed";

export type MemberStatus = "pending" | "approved" | "rejected";

/**
 * A sala como o CLIENTE pode ler: as 14 colunas da view `rooms_public`.
 *
 * Desde a migration `20260930000038` (Fase 8c·C, fechando F1/F2 da auditoria
 * de RLS) o tipo NÃO tem mais `youtube_api_key` nem `player_token`: as duas
 * saíram do alcance do papel `authenticated` por ACL de coluna, e a leitura
 * delas é por RPC `security definer` que só o dono da sala chama — o que também
 * impede o `select *` de vazar segredo por acidente. E o tipo é a segunda
 * defesa: se alguém reintroduzir um campo sensível aqui, o TypeScript reclama
 * antes de o banco ver a query.
 */
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
  status: RoomStatus;
  created_at: string;
  /** Estado de reprodução (lê o quiosque; null em salas paradas). */
  playback_status?: string | null;
  current_item_id?: string | null;
  current_item_started_at?: string | null;
};

/**
 * Os dois segredos da sala, que NÃO moram em `Room` desde a `20260930000038`.
 * Chegam por RPC `security definer` (host-only) e são usados só no servidor.
 */
export type RoomSecrets = {
  /** Credencial do link da TV — o próprio repo trata como segredo. */
  playerToken: string | null;
  /** Chave de API do YouTube que o host configurou para a sala. */
  youtubeApiKey: string | null;
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
