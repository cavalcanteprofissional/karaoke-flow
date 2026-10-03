"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { readUserGeoFromCookies } from "@/lib/bars/presence";
import { createClient } from "@/lib/supabase/server";
import type { BarLocation } from "@/lib/bars/geo";
import {
  buildQueueModeration,
  buildQueueRemoval,
  buildQueueSongItem,
  buildQueueSongReplacement,
  reorderSchema,
} from "./queue";
import type { MembershipStatus, QueueSongInput, QueueSongVideo } from "./queue";
import { getMemberEntryState } from "@/lib/rooms/entry-state";
import { canRequestSongs } from "@/lib/rooms/spectator";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  return message;
}

type ModerationTarget = {
  item: { id: string; status: string; added_by_user_id: string };
  room: { host_id: string; code: string };
};

type ModerationTargetResult =
  | { ok: true; target: ModerationTarget }
  | { ok: false; error: string; code: string };

/**
 * Pré-leitura compartilhada por aprovar/rejeitar, remover e trocar (Fase 8a).
 *
 * O embed precisa do NOME da FK. A Fase 6 (migration 00027) criou
 * `rooms.current_item_id → queue_items.id`, e isso deixou a relação
 * `queue_items → rooms` ambígua: o PostgREST passou a responder PGRST201
 * ("more than one relationship") para o `rooms!inner(...)` sem hint. Como a
 * action só olhava `data`, qualquer erro virava `data: null` → NOT_FOUND
 * "Essa música não está mais na fila." e o UPDATE/DELETE nunca rodava — aprovar,
 * remover e trocar estavam mortos desde a Fase 6.
 *
 * Duas defesas, para o próximo erro de PostgREST não virar "a música sumiu" de
 * novo: o hint desambigua, e o `error` é reportado como READ_FAILED com a
 * mensagem real em vez de ser descartado. Reproduza com `npm run
 * diagnose:queue` (scripts/diagnose-queue-actions.mjs).
 */
async function readModerationTarget(
  supabase: ServerSupabase,
  itemId: string
): Promise<ModerationTargetResult> {
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, status, added_by_user_id, rooms!queue_items_room_id_fkey(host_id, code)")
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível ler a fila desta sala."),
      code: "READ_FAILED",
    };
  }

  const embedded = data?.rooms;
  const room = (Array.isArray(embedded) ? embedded[0] : embedded ?? null) as {
    host_id: string;
    code: string;
  } | null;
  if (!data || !room) {
    return { ok: false, error: "Essa música não está mais na fila.", code: "NOT_FOUND" };
  }

  return {
    ok: true,
    target: {
      item: {
        id: data.id,
        status: data.status,
        // `queue_items.added_by_user_id` é NOT NULL no banco.
        added_by_user_id: data.added_by_user_id as string,
      },
      room,
    },
  };
}

export async function addSongToQueueAction(
  input: QueueSongInput
): Promise<
  | { ok: true; item: { status: string; position: number } }
  | { ok: false; error: string; geoRequired?: boolean; code?: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para adicionar músicas.",
      code: "UNAUTHENTICATED",
    };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("id, host_id, bar_id")
    .eq("code", input.roomCode)
    .maybeSingle();
  if (!room) {
    return { ok: false, error: "Sala não encontrada.", code: "ROOM_NOT_FOUND" };
  }

  let bar: BarLocation = { latitude: null, longitude: null, raioPermitidoMetros: null };
  if (room.bar_id) {
    const { data: barRow } = await supabase
      .from("bars")
      .select("latitude, longitude, raio_permitido_metros")
      .eq("id", room.bar_id)
      .maybeSingle();
    if (barRow) {
      bar = {
        latitude: barRow.latitude ?? null,
        longitude: barRow.longitude ?? null,
        raioPermitidoMetros: barRow.raio_permitido_metros ?? null,
      };
    }
  }

  const isHost = room.host_id === user.id;
  /**
   * Estado efetivo pela função que a tela da sala e a busca leem
   * (`member_entry_state`), nunca `select status` em `room_members`: a linha
   * crua é o que o host aprovou, e a pré-aprovação de 24h pode ter vencido —
   * tratá-la como "aprovado" devolvia a busca para quem não está mais na sala.
   */
  const entry = isHost ? null : await getMemberEntryState(room.id);
  const entryState = entry?.ok === true ? (entry.state ?? null) : null;
  const membership: MembershipStatus =
    isHost || entryState?.status === "approved"
      ? isHost
        ? "host"
        : "approved"
      : entryState?.status === "pending"
        ? "pending"
        : "none";

  /**
   * O espectador entrou fora do raio: a regra vale na tela **e** na fila. Se
   * morasse só na tela, o botão sumiria mas o `add` continuaria aceitando — e a
   * UI deixaria de ser a parte honesta da regra, que é exatamente o que a
   * migration 20261003000040 tentou evitar quando gravou a decisão no join.
   *
   * Só entra aqui o membro aprovado; `pending` e `none` seguem para as mensagens
   * que já existiam, em `buildQueueSongItem`.
   */
  if (entryState?.status === "approved" && !canRequestSongs({ isHost, membership: entryState })) {
    return {
      ok: false,
      error: "Você entrou de fora do raio do bar: acompanha a fila, mas não pode pedir música.",
      code: "OUTSIDE_BAR",
    };
  }

  const cookieStore = await cookies();
  const userCoords = readUserGeoFromCookies(cookieStore);

  const built = buildQueueSongItem({
    input,
    roomId: room.id,
    userId: user.id,
    membership,
    isHost,
    bar,
    userCoords,
  });
  if (!built.ok) return built;

  const { data, error } = await supabase
    .from("queue_items")
    .insert({
      room_id: built.insert.roomId,
      added_by_user_id: built.insert.userId,
      youtube_video_id: built.insert.video.videoId,
      title: built.insert.video.title,
      thumbnail_url: built.insert.video.thumbnailUrl ?? null,
      duration_seconds: built.insert.video.durationSeconds ?? null,
    })
    .select("id, status, position");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Você não pode adicionar músicas nesta sala."),
      code: "INSERT_FAILED",
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Você não pode adicionar músicas nesta sala.",
      code: "RLS_BLOCKED",
    };
  }

  revalidatePath(`/salas/${input.roomCode}`);
  revalidatePath(`/salas/${input.roomCode}/buscar`);
  return { ok: true, item: { status: data[0].status, position: data[0].position } };
}
/**
 * Aprova ou rejeita uma música da fila (Fase 5, Bloco A).
 *
 * A escrita vai pelo client do usuário (RLS `queue_items_update_host`,
 * host-only) — sem RPC: a RPC só é necessária quando alguém que **não** é o
 * host precisa escrever (`replace_queue_song`, Bloco D). A regra pura
 * (`buildQueueModeration`) dá o feedback imediato; o `.select()` abaixo é a
 * prova de que a policy deixou passar (no-op de policy vira erro, não sucesso
 * silencioso). Sala encerrada não precisa de checagem própria: `close_room`
 * deixa os itens em `cancelled`, que a regra trata como transição inválida.
 */
export async function setQueueItemStatusAction(
  itemId: string,
  decision: unknown
): Promise<
  | { ok: true; item: { id: string; status: string } }
  | { ok: false; error: string; code: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para gerenciar a fila.",
      code: "UNAUTHENTICATED",
    };
  }

  const target = await readModerationTarget(supabase, itemId);
  if (!target.ok) return target;
  const { item, room } = target.target;
  const isHost = room.host_id === user.id;

  const built = buildQueueModeration({ isHost, userId: user.id, item, decision });
  if (!built.ok) return built;

  const { data, error } = await supabase
    .from("queue_items")
    .update({ status: built.status })
    .eq("id", built.itemId)
    .select("id, status");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível atualizar a música."),
      code: "UPDATE_FAILED",
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Só o dono da sala pode aprovar ou rejeitar músicas.",
      code: "RLS_BLOCKED",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  revalidatePath(`/salas/${room.code}/buscar`);
  return { ok: true, item: { id: data[0].id, status: data[0].status } };
}

/**
 * Remove uma música da fila (Fase 5, Bloco A; corrigido em 2026-09-27).
 *
 * Quem apaga: o host (qualquer item visível) ou o AUTOR do pedido, enquanto ele
 * não entrou em reprodução — a policy `queue_items_delete_own` foi criada junto
 * com a regra pura, porque sem ela o botão "Tirar da fila" do participante
 * devolvia sempre "Só o dono da sala pode remover músicas". O `.select()` prova
 * que a linha saiu (no-op de policy vira erro, não sucesso silencioso).
 */
export async function removeQueueItemAction(
  itemId: string
): Promise<{ ok: true; itemId: string } | { ok: false; error: string; code: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para gerenciar a fila.",
      code: "UNAUTHENTICATED",
    };
  }

  const target = await readModerationTarget(supabase, itemId);
  if (!target.ok) return target;
  const { item, room } = target.target;
  const isHost = room.host_id === user.id;

  const built = buildQueueRemoval({ isHost, userId: user.id, item });
  if (!built.ok) return built;

  const { data, error } = await supabase
    .from("queue_items")
    .delete()
    .eq("id", built.itemId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível remover a música."),
      code: "DELETE_FAILED",
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: isHost
        ? "Não foi possível remover a música."
        : "Você só pode tirar da fila a música que você mesmo pediu.",
      code: "RLS_BLOCKED",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  revalidatePath(`/salas/${room.code}/buscar`);
  return { ok: true, itemId: data[0].id };
}

/**
 * Reordena a fila do host (Fase 5, Bloco C) em UMA chamada atômica: a RPC
 * `reorder_queue` reescreve `position` de 1..N na ordem recebida, sob advisory
 * lock (mesma chave de `next_queue_position`) e exigindo a fila visível inteira.
 * Sem isso, o client teria que fazer N updates — cada um disparando
 * `touch_updated_at` → N refetches do realtime — e abriria janela para
 * posições repetidas (não há unique em `(room_id, position)`).
 */
export async function reorderQueueAction(
  roomId: string,
  itemIds: string[]
): Promise<{ ok: true; itemIds: string[] } | { ok: false; error: string; code: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para reorder a fila.",
      code: "UNAUTHENTICATED",
    };
  }

  const parsed = reorderSchema.safeParse(itemIds);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ordem inválida.",
      code: "VALIDATION",
    };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("code")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return { ok: false, error: "Sala não encontrada.", code: "ROOM_NOT_FOUND" };
  }

  const { data, error } = await supabase.rpc("reorder_queue", {
    p_room_id: roomId,
    p_item_ids: parsed.data,
  });
  if (error) {
    const message = error.message;
    if (/fila desatualizada/i.test(message)) {
      return {
        ok: false,
        error: "A fila mudou enquanto você reordenava — tentando de novo.",
        code: "STALE_QUEUE",
      };
    }
    return {
      ok: false,
      error: friendlyError(message, "Não foi possível reordenar a fila."),
      code: "REORDER_FAILED",
    };
  }
  if (data !== true) {
    return {
      ok: false,
      error: "Só o dono da sala pode reorder a fila.",
      code: "FORBIDDEN",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  return { ok: true, itemIds: parsed.data };
}

/**
 * Trocar a música do item mantendo posição e aprovação (Fase 5, Bloco D,
 * regras D1–D3). Escrita via RPC `replace_queue_song` porque o AUTOR do item
 * não é host e a policy de UPDATE é host-only — o client não ganha UPDATE em
 * `queue_items`.
 */
export async function replaceQueueSongAction(
  itemId: string,
  video: QueueSongVideo
): Promise<
  | { ok: true; item: { id: string; title: string } }
  | { ok: false; error: string; code: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Faça login para trocar a música.",
      code: "UNAUTHENTICATED",
    };
  }

  const target = await readModerationTarget(supabase, itemId);
  if (!target.ok) return target;
  const { item, room } = target.target;

  const built = buildQueueSongReplacement({
    isHost: room.host_id === user.id,
    currentUserId: user.id,
    item,
    input: { video },
  });
  if (!built.ok) return built;

  const { data, error } = await supabase.rpc("replace_queue_song", {
    p_item_id: built.itemId,
    p_youtube_video_id: built.video.videoId,
    p_title: built.video.title,
    p_thumbnail_url: built.video.thumbnailUrl ?? null,
    p_duration_seconds: built.video.durationSeconds ?? null,
  });
  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível trocar a música."),
      code: "REPLACE_FAILED",
    };
  }
  if (data !== true) {
    return {
      ok: false,
      error: "Você só pode trocar a música que você mesmo pediu.",
      code: "FORBIDDEN",
    };
  }

  revalidatePath(`/salas/${room.code}`);
  revalidatePath(`/salas/${room.code}/buscar`);
  return { ok: true, item: { id: built.itemId, title: built.video.title } };
}
