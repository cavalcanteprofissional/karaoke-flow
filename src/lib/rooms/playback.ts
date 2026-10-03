import { z } from "zod";

/**
 * Regras puras do playback (Fase 6/7) — o mesmo contrato que a migration
 * `20260926000027_playback_state.sql` implementa no banco, escrito aqui para a
 * tela poder reagir sem round-trip e para o erro aparecer na hora.
 *
 * A TV (player) entra por token de capacidade, sem sessão: por isso o estado
 * chega do banco já filtrado por `get_player_state` e precisa ser validado
 * antes de virar tela — um jsonb quebrado não pode deixar o quiosque em branco.
 */

export const PLAYBACK_STATUSES = ["idle", "playing", "paused"] as const;
export type PlaybackStatus = (typeof PLAYBACK_STATUSES)[number];

export const PLAYBACK_ACTIONS = ["play", "pause", "skip", "stop"] as const;
export type PlaybackAction = (typeof PLAYBACK_ACTIONS)[number];

export const playbackActionSchema = z.enum(PLAYBACK_ACTIONS, {
  message: "Comando inválido.",
});
export const playerTokenSchema = z.string().uuid("Player inválido.");

export const playerItemSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  youtube_video_id: z.string().min(1),
  title: z.string().min(1),
  duration_seconds: z.number().int().nullable(),
  status: z.string().min(1),
  requested_by: z.string().nullable(),
});

export const playerCurrentSchema = playerItemSchema.extend({
  started_at: z.string().nullable(),
  elapsed_seconds: z.number().int().nonnegative().nullable(),
});

export const playerStateSchema = z.object({
  ok: z.literal(true),
  room: z.object({
    code: z.string().min(1),
    status: z.string().min(1),
    playback_status: z.enum(PLAYBACK_STATUSES),
    queue_approval_mode: z.string().min(1),
    require_song_confirmation: z.boolean(),
  }),
  current: playerCurrentSchema.nullable(),
  queue: z.array(playerItemSchema),
  pending_count: z.number().int().nonnegative(),
});

export type PlayerItem = z.infer<typeof playerItemSchema>;
export type PlayerCurrent = z.infer<typeof playerCurrentSchema>;
export type PlayerState = z.infer<typeof playerStateSchema>;

export type PlayerStateResult =
  { ok: true; state: PlayerState } | { ok: false; error: string; code: string };

/** O banco responde `{ ok: false, error }` (ex.: token inválido). */
export type PlayerStateFailure = { ok: false; error?: unknown };

export function isPlayerStateFailure(raw: unknown): raw is PlayerStateFailure {
  return (
    typeof raw === "object" && raw !== null && (raw as { ok?: unknown }).ok === false
  );
}

/**
 * Valida o retorno de `get_player_state`/`claim_next_song`. O quiosque nunca
 * renderiza estado não validado: se o banco devolver algo fora do contrato,
 * viramos "player inválido" em vez de quebrar a tela da TV.
 */
export function parsePlayerState(raw: unknown): PlayerStateResult {
  if (isPlayerStateFailure(raw)) {
    const error = (raw as { error?: unknown }).error;
    return {
      ok: false,
      error: typeof error === "string" ? error : "Player inválido.",
      code: "PLAYER_INVALID",
    };
  }
  const parsed = playerStateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Não foi possível ler o estado do player.",
      code: "PLAYER_SHAPE",
    };
  }
  return { ok: true, state: parsed.data };
}

/** Lê `?token=` da URL do quiosque (aceita array do Next e string solta). */
export function parsePlayerToken(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = playerTokenSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type PlaybackControls = {
  canPlay: boolean;
  canPause: boolean;
  canSkip: boolean;
  canStop: boolean;
  playLabel: string;
  emptyHint: string | null;
};

/**
 * O que o controle do host mostra (Fase 7). Regra: sem item tocando, o host
 * pode "tocar" se houver algo aprovado; com item tocando, pausa/pular/parar
 * ficam disponíveis. Quem não é host não vê controle nenhum — mas a regra não
 * substitui a autorização: `set_playback` exige host no banco.
 */
export function playbackControls(ctx: {
  isHost: boolean;
  status: PlaybackStatus;
  hasCurrent: boolean;
  queueLength: number;
}): PlaybackControls {
  const nothingToPlay = !ctx.hasCurrent && ctx.queueLength === 0;
  return {
    canPlay:
      ctx.isHost && !nothingToPlay && (ctx.status !== "playing" || !ctx.hasCurrent),
    canPause: ctx.isHost && ctx.hasCurrent && ctx.status === "playing",
    canSkip: ctx.isHost && ctx.hasCurrent,
    canStop: ctx.isHost && ctx.hasCurrent,
    playLabel: ctx.hasCurrent ? "Retomar" : "Tocar",
    emptyHint: nothingToPlay
      ? ctx.isHost
        ? "Nenhuma música aprovada na fila."
        : "A fila do karaokê aparece aqui."
      : null,
  };
}

export type AutoAdvanceInput = {
  playbackStatus: PlaybackStatus;
  currentVideoId: string | null;
  /** VideoId que o IFrame Player API acabou de terminar (0 = nada terminou). */
  endedVideoId: string | null;
  queueLength: number;
  /** A TV já foi ARMADA pelo toque? Desarmada, ninguém está assistindo. */
  armed: boolean;
  /** Esta tela pode puxar a próxima? Só a TV (que tem o token) pode. */
  canAdvance: boolean;
};

/**
 * O player (TV) avança sozinho: quando a faixa termina e, no boot, quando a
 * sala está ociosa com música aprovada. Com `paused` nunca avança — quem
 * segura é o host. `wait` mantém o quiosque no estado atual.
 *
 * `armed: false` também nunca: desarmada, a fila não pode se esvaziar sozinha
 * com ninguém olhando (a TV do outro lado da sala ia puxando faixa e ninguém
 * veria nada — e o wouldn't-have-a-cue de "próxima" mentindo na tela).
 *
 * `canAdvance: false` também nunca, e é o caso de quem só assiste: o celular do
 * convidado tem o `/player/<código>` sem token, a fila anda na TV, e avançar de
 * um celular deixaria duas telas disputando o mesmo item sob advisory lock — cada
 * `claim` novo tentando terminar o anterior.
 */
export function shouldAutoAdvance(input: AutoAdvanceInput): boolean {
  if (!input.canAdvance) return false;
  if (!input.armed) return false;
  if (input.playbackStatus === "paused") return false;
  if (!input.currentVideoId) return input.queueLength > 0;
  return input.endedVideoId !== null && input.endedVideoId === input.currentVideoId;
}

export type ClaimFromIdleInput = {
  playbackStatus: PlaybackStatus;
  /** Item em reprodução (`current.id`); `null` = sala ociosa. */
  currentItemId: string | null;
  queueLength: number;
  /** A TV já foi ARMADA pelo toque? Desarmada, ninguém está assistindo. */
  armed: boolean;
  /** Esta tela pode puxar a próxima? Só a TV (que tem o token) pode. */
  canAdvance: boolean;
};

/**
 * A sala está ociosa e tem música aprovada esperando? Então a TV pede a próxima
 * sozinha.
 *
 * É a mesma pergunta que `shouldAutoAdvance` responde no boot e no fim da faixa,
 * mas pelos MOTIVOS de estado (não de vídeo): uma música aprovada DEPOIS que a
 * TV abriu precisa começar sem ninguém tocar em nada. Sem isso, o quiosque ficava
 * parado em "Escaneie para adicionar" enquanto o host via a lista aprovada e a
 * TV não — o claim só existia no mount e no `onEnded`.
 *
 * Com `paused` nunca: quem segura é o host. `queueLength` é a fila aprovada que
 * `get_player_state` devolve (o que a TV pode tocar agora). Desarmada também
 * nunca: pedir a próxima sem ninguém olhando faria a fila andar sozinha e cada
 * item sairia do estado `approved` para `playing` (e depois `played`) sem nunca
 * ter passado pela tela — o host perde a faixa sem ninguém perceber.
 *
 * `canAdvance: false` nunca, pelo mesmo motivo de `shouldAutoAdvance`: quem
 * assiste não disputa a fila com a TV.
 */
export function shouldClaimFromIdle(input: ClaimFromIdleInput): boolean {
  if (!input.canAdvance) return false;
  if (!input.armed) return false;
  if (input.playbackStatus === "paused") return false;
  if (input.currentItemId) return false;
  return input.queueLength > 0;
}

export type PlayerGateInput = {
  /** A TV já foi ARMADA pelo toque? */
  armed: boolean;
  /** Item em reprodução (`current.id`); `null` = sala ociosa. */
  currentItemId: string | null;
  /** Itens aprovados que a TV pode tocar agora (`state.queue`). */
  queueLength: number;
  /**
   * A TV já mandou `play` para a faixa atual e a reprodução não começou (erro
   * 150 / gesto recusado). Distingue "nada tocando de verdade" de "travado antes
   * do primeiro frame".
   */
  stalled: boolean;
};

/**
 * A TV está DESARMADA e há o que tocar? Então o toque de partida é obrigatório.
 *
 * Fila vazia NÃO pede o toque: a tela segue o "Escaneie para adicionar músicas",
 * que é o que os convidados veem antes de existir faixa. O gate vira o principal
 * assim que o host aprova algo (o poll de 5s do quiosque percebe).
 *
 * `stalled` manda em tudo, armada ou não: ele é a fase "tentar de novo", e ela
 * acontece com o player montado e o vídeo parado no primeiro frame (erro 150 /
 * gesto recusado). Se o gate se escondesse quando `armed`, o 150 deixaria a TV
 * num retângulo mudo sem nenhum botão — o pior dos dois mundos. Já tocou
 * normalmente? Aí `stalled` é `false` e o gate some no `PLAYING`.
 */
export function shouldShowPlayerGate(input: PlayerGateInput): boolean {
  if (input.stalled) return true;
  if (input.armed) return false;
  return Boolean(input.currentItemId) || input.queueLength > 0;
}

export type PlayerPanelRow = {
  item: PlayerItem;
  /** `now` = tocando, `next` = próxima (destaque forte na TV), `upcoming`. */
  highlight: "now" | "next" | "upcoming";
};

export type PlayerPanel = {
  rows: PlayerPanelRow[];
  hasNext: boolean;
  pendingCount: number;
  empty: boolean;
};

/**
 * Faixa da tela do player: o que toca, a próxima em destaque e as seguintes.
 * A fila vem do banco já em ordem de `position` (apenas `approved` + o
 * item atual), então aqui é só a hierarquia visual.
 */
export function playerPanel(state: PlayerState, limit = 6): PlayerPanel {
  const upNext = state.queue.filter((item) => item.id !== state.current?.id);
  const rows: PlayerPanelRow[] = [];
  if (state.current) {
    rows.push({ item: state.current, highlight: "now" });
  }
  upNext.slice(0, Math.max(0, limit - rows.length)).forEach((item, index) => {
    rows.push({ item, highlight: index === 0 ? "next" : "upcoming" });
  });
  return {
    rows,
    hasNext: upNext.length > 0,
    pendingCount: state.pending_count,
    empty: rows.length === 0,
  };
}

/** Frase do cabeçalho da TV: "Tocando agora" / "Pausado" / "Nada tocando". */
export function playerHeadline(state: PlayerState): string {
  if (state.room.status !== "active") return "Sala encerrada";
  if (!state.current) return "Nada tocando agora";
  if (state.room.playback_status === "paused") return "Pausado";
  return "Tocando agora";
}
