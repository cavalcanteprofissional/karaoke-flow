"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import {
  barMesasSchema,
  createBarSchema,
  createRoomSchema,
  barRadiusSchema,
  type CreateBarInput,
  type CreateRoomInput,
} from "@/lib/bars/schema";
import { requirePresence } from "@/lib/bars/presence";
import {
  geocodeAddress,
  isOutsideBar,
  needsLocationConsent,
  type PresenceDecision,
} from "@/lib/bars/geo";
import { deriveRoomCodeFromName } from "@/lib/rooms/utils";
import { getMemberEntryState } from "@/lib/rooms/entry-state";
import { MESA_MAX, type EntryBarPreview } from "@/types/bar";
import type { EntryMembership, MemberStatus } from "@/types/room";

type CreateBarRpcRow = {
  bar_id: string;
  bar_code: string;
  room_id: string;
  room_code: string;
};

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  if (/não autenticado/i.test(message)) return "Faça login para entrar.";
  if (/já tem um bar|uma casa/i.test(message))
    return "Você já tem um bar. Cada dono tem uma casa — use o mesmo bar para novas salas.";
  if (/já tem uma sala|um karaokê/i.test(message))
    return "Você já tem uma sala. Cada dono tem um karaokê.";
  if (/bar não encontrado/i.test(message)) return "Bar não encontrado.";
  if (/sala não encontrada|inativa/i.test(message))
    return "Sala não encontrada ou inativa.";
  if (/mesa inválida|mesa não existe/i.test(message))
    return "Mesa inválida para este bar.";
  if (/escolha uma mesa/i.test(message)) return "Escolha uma mesa para entrar.";
  if (/crie uma conta/i.test(message)) return "Crie uma conta para criar o seu bar.";
  if (/localização incompleta|latitude inválida|longitude inválida/i.test(message))
    return "Localização do bar inválida.";
  if (/raio de presença inválido/i.test(message))
    return "Raio de presença inválido (50–1000 m).";
  if (/bar sem sala ativa/i.test(message)) return "Esta casa está encerrada no momento.";
  return message;
}

function readMembership(value: unknown): EntryMembership | null {
  const membership = (Array.isArray(value) ? value[0] : value) as {
    status?: MemberStatus;
    mesa_numero?: number | null;
  } | null;
  if (!membership?.status) return null;
  return {
    status: membership.status,
    mesa_numero: membership.mesa_numero ?? null,
  };
}

export type CreateBarResult =
  | { ok: true; bar: { id: string; code: string; room_code: string } }
  | { ok: false; error: string };

export type UpdateBarRadiusResult =
  { ok: true; radiusMeters: number } | { ok: false; error: string };

/**
 * Raio de presença escolhido pelo host (`bars.raio_permitido_metros`).
 *
 * O raio é **do bar** (vale para as salas dele) e é o mesmo número que o gate
 * valida no servidor (`checkPresence`/`requirePresence`) — por isso a tela não
 * pode ter cópia: o que o host vê aqui é o que o banco cobra.
 *
 * A escrita vai pelo client do usuário, então quem não é dono é barrado pela
 * RLS (`bars_update_own`); o `.select()` sem linhas detecta o no-op da policy
 * para nunca devolver sucesso silencioso.
 */
export async function updateBarRadiusAction(
  barId: string,
  rawRadius: unknown
): Promise<UpdateBarRadiusResult> {
  const parsed = barRadiusSchema.safeParse(rawRadius);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, error: first?.message ?? "Raio de presença inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Faça login para mudar o raio do bar." };
  }

  const { data, error } = await supabase
    .from("bars")
    .update({ raio_permitido_metros: parsed.data })
    .eq("id", barId)
    .select("id, raio_permitido_metros");
  if (error) {
    if (/raio_permitido_metros|bars_raio_check/i.test(error.message)) {
      return { ok: false, error: "Raio de presença inválido (50–1000 m)." };
    }
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível salvar o raio de presença."),
    };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Só o dono do bar pode mudar o raio de presença." };
  }

  revalidatePath("/salas/[codigo]", "page");
  // Fase 17: o controle do raio (`PresenceGateInfo`) saiu da sala e virou a
  // tela do bar — sem revalidar `/bar/[codigo]` o valor digitado voltaria a
  // parecer o antigo em qualquer nova visita.
  revalidatePath("/bar/[codigo]", "page");
  return { ok: true, radiusMeters: parsed.data };
}

export type UpdateBarMesasResult =
  | { ok: true; quantidadeMesas: number; reallocados: number }
  | { ok: false; error: string };

/**
 * Quantidade de mesas do bar (Fase 16) — 1 por padrão, até 10.
 *
 * Vai pela RPC `update_bar_mesas` (migration `20261008000001`) porque são três
 * escritas que valem juntas: realocar quem sentou em mesa removida, sincronizar
 * as linhas de `mesas` e atualizar `bars.quantidade_mesas`. A autorização mora
 * dentro da RPC (só o dono), então aqui só traduzimos erro — mesmo desenho de
 * `createBarAction`.
 */
export async function updateBarMesasAction(
  barId: string,
  raw: unknown
): Promise<UpdateBarMesasResult> {
  const parsed = barMesasSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, error: first?.message ?? "Quantidade de mesas inválida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Faça login para mudar as mesas do bar." };
  }

  const { data, error } = await supabase.rpc("update_bar_mesas", {
    p_bar_id: barId,
    p_nova_qtd: parsed.data,
  });
  if (error) {
    if (/bar não encontrado/i.test(error.message)) {
      return { ok: false, error: "Só o dono do bar pode mudar a quantidade de mesas." };
    }
    if (/quantidade de mesas inválida/i.test(error.message)) {
      return { ok: false, error: `O bar aceita de 1 a ${MESA_MAX} mesas.` };
    }
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível salvar a quantidade de mesas."),
    };
  }

  const result = (data ?? {}) as { quantidade_mesas?: number; reallocados?: number };
  revalidatePath("/salas/[codigo]", "page");
  // Fase 17: "Mesas do bar", o QR e a ocupação da sala viraram a rota
  // `/salas/[codigo]/sala` — sem ela o card continuaria mostrando a quantidade
  // antiga até alguém recarregar a tela ao vivo.
  revalidatePath("/salas/[codigo]/sala", "page");
  revalidatePath("/dashboard");
  return {
    ok: true,
    quantidadeMesas: result.quantidade_mesas ?? parsed.data,
    reallocados: result.reallocados ?? 0,
  };
}

export async function createBarAction(raw: unknown): Promise<CreateBarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Faça login para criar o seu bar." };
  }

  const parsed = createBarSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: first?.message ?? "Dados do bar inválidos.",
    };
  }
  const input = parsed.data as CreateBarInput;

  const { data, error } = (await supabase
    .rpc("create_bar", {
      p_nome: input.nome,
      p_cidade: input.cidade ?? "",
      p_endereco: input.endereco ?? "",
      p_quantidade_mesas: input.quantidade_mesas,
      p_rotulos: input.rotulos.length > 0 ? input.rotulos : null,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_raio_permitido_metros: input.raio_permitido_metros,
      p_codigo: input.codigo_entrada ?? deriveRoomCodeFromName(input.nome),
    })
    .single()) as { data: CreateBarRpcRow | null; error: { message: string } | null };

  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível criar o bar."),
    };
  }
  if (!data) {
    return { ok: false, error: "Não foi possível criar o bar." };
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    bar: { id: data.bar_id, code: data.bar_code, room_code: data.room_code },
  };
}

export type CreateRoomResult =
  { ok: true; room: { id: string; code: string } } | { ok: false; error: string };

/**
 * Abre uma nova sala (karaokê) dentro de um bar que JÁ existe.
 *
 * Antes não havia caminho para isso: `create_bar` sempre nasce com exatamente
 * uma sala, e a UI só tinha uma affordance desligada ("multi-sala chega em uma
 * fase futura"). A autorização mora na RPC `create_room` — ela exige
 * `bars.host_id = auth.uid()` antes de escrever, então quem não é dono leva
 * "bar não encontrado" e nada é criado. Esta action só traduz o erro.
 */
export async function createRoomAction(raw: unknown): Promise<CreateRoomResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Faça login para abrir uma sala." };
  }

  const parsed = createRoomSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { ok: false, error: first?.message ?? "Dados da sala inválidos." };
  }
  const input = parsed.data as CreateRoomInput;

  const { data, error } = (await supabase
    .rpc("create_room", {
      p_bar_id: input.bar_id,
      p_codigo: input.codigo_entrada ?? null,
    })
    .single()) as {
    data: { room_id: string; room_code: string } | null;
    error: { message: string } | null;
  };

  if (error) {
    return {
      ok: false,
      error: friendlyError(error.message, "Não foi possível abrir a sala."),
    };
  }
  if (!data) {
    return { ok: false, error: "Não foi possível abrir a sala." };
  }

  revalidatePath("/dashboard");
  return { ok: true, room: { id: data.room_id, code: data.room_code } };
}

export type EntryPreviewResult =
  | {
      preview: EntryBarPreview;
      mesa?: number;
      membership?: EntryMembership;
      presence?: PresenceDecision;
    }
  | { error: string };

/**
 * Preview de entrada. `code` pode ser código de BAR ou de room (QR legado);
 * `mesa` opcional vem do QR de mesa (valida a existência na RPC).
 * Calcula o gate de presença (participante) para o client exibir o aviso
 * antes do join.
 */
export async function getEntryPreviewAction(
  code: string,
  mesa?: number | null
): Promise<EntryPreviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = (await supabase.rpc("get_entry_preview", {
    p_code: code,
    p_mesa: mesa ?? null,
  })) as { data: unknown; error: { message: string } | null };
  if (error || !Array.isArray(data) || data.length === 0) {
    return { error: friendlyError(error?.message ?? "", "Bar não encontrado.") };
  }
  const first = data[0] as EntryBarPreview;

  const isAnonymous =
    (user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true) === true;
  const isHost = !!user && !isAnonymous && first.host_id === user.id;

  let presence: PresenceDecision | undefined;
  if (!isHost) {
    const store = await cookies();
    presence = requirePresence({
      isHost: false,
      bar: {
        latitude: first.bar_latitude,
        longitude: first.bar_longitude,
        raioPermitidoMetros: first.bar_raio_permitido_metros,
      },
      store,
    });
  }

  let membership: EntryMembership | undefined;
  if (user) {
    // Status EFETIVO (com a regra das 24h), não a linha crua: quem foi aprovado
    // há mais de 24h precisa ver a tela de entrada de novo, não entrar direto.
    const entry = await getMemberEntryState(first.room_id);
    if (entry.ok && entry.state) {
      membership = { status: entry.state.status, mesa_numero: entry.state.mesa_numero };
    }
  }

  return {
    preview: first,
    mesa: first.mesa_numero ?? membership?.mesa_numero ?? undefined,
    membership,
    presence,
  };
}

export type JoinEntryResult =
  | { ok: true; membership: EntryMembership }
  | { ok: false; error: string; geoRequired?: boolean };

/** Estado do pedido de entrada do próprio participante, para a tela de espera. */
export type EntryRequestState = MemberStatus | "cancelled" | "closed" | "none";

/**
 * Consulta o estado real do pedido quando a linha de `room_members` some
 * (cancelamento em outra aba, expulsão ou `close_room`, que apaga todos).
 * O participante `pending` não lê `rooms` por RLS, então o status da sala vem
 * do client de service role — somente leitura, e sem `youtube_api_key`.
 */
export async function getEntryRequestStateAction(
  roomCode: string
): Promise<{ state: EntryRequestState }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "none" };

  const code = roomCode.trim().toUpperCase();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, status")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    const { data: fallback } = await createAdmin()
      .from("rooms")
      .select("id, status")
      .eq("code", code)
      .maybeSingle();
    if (!fallback || fallback.status === "closed") return { state: "closed" };
    return { state: "cancelled" };
  }
  if (room.status === "closed") return { state: "closed" };

  // Mesma fonte da preview: o status efetivo. Uma pré-aprovação vencida precisa
  // devolver `pending` aqui também, senão a tela de espera pularia direto para
  // a sala com um status que o banco já não considera.
  const entry = await getMemberEntryState(room.id);
  if (!entry.ok) return { state: "none" };
  if (!entry.state) return { state: "cancelled" };

  return { state: entry.state.status };
}

/**
 * Entra na sala do bar. `roomCode` é o código da sala resolvida na preview.
 *
 * `mesa` é `null` quando quem entra está **fora do raio**: a grade de mesas
 * nem aparece e a entrada é só para assistir (a fila barra o pedido de música
 * em `buildQueueSongItem`). Dentro do raio, `null` ainda é aceito — quem entra
 * por QR de sala escolhe a mesa depois, dentro da sala.
 */
export async function joinEntryAction(
  roomCode: string,
  mesa: number | null
): Promise<JoinEntryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Faça login para entrar." };

  const isAnonymous =
    (user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true) === true;

  const { data: previewRows, error: previewError } = (await supabase.rpc(
    "get_entry_preview",
    { p_code: roomCode, p_mesa: mesa }
  )) as { data: unknown; error: { message: string } | null };
  if (previewError || !Array.isArray(previewRows) || previewRows.length === 0) {
    return {
      ok: false,
      error: friendlyError(previewError?.message ?? "", "Sala não encontrada."),
    };
  }
  const preview = previewRows[0] as EntryBarPreview;

  const presence = requirePresence({
    isHost: preview.host_id === user.id && !isAnonymous,
    bar: {
      latitude: preview.bar_latitude,
      longitude: preview.bar_longitude,
      raioPermitidoMetros: preview.bar_raio_permitido_metros,
    },
    store: await cookies(),
  });
  // Só a falta de consentimento/coord barra a entrada. Quem está fora do raio
  // entra sem mesa para assistir (ver `canEnterAsViewer`).
  if (needsLocationConsent(presence)) {
    return { ok: false, error: presence.error, geoRequired: true };
  }

  const { data, error } = (await supabase.rpc("join_room", {
    p_code: roomCode,
    p_mesa: mesa,
    // A decisão de presença que o servidor acabou de tomar vira número na linha
    // do membro: é o que o contador do host lê para separar quem está no bar de
    // quem entrou de fora. `geo-unavailable` nem chega aqui (voltou antes).
    p_fora_do_raio: isOutsideBar(presence),
    p_distancia_m: presence.distanceMeters ?? null,
  })) as { data: unknown; error: { message: string } | null };
  if (error) {
    return { ok: false, error: friendlyError(error.message, "Não foi possível entrar.") };
  }
  const membership = readMembership(data) ?? {
    status: preview.entry_mode === "open" ? ("approved" as const) : ("pending" as const),
    mesa_numero: mesa,
  };
  revalidatePath("/dashboard");
  revalidatePath("/entrar");
  return { ok: true, membership };
}

/** Pedido de entrada pendente do próprio participante (para a lista de
 * "acompanhar/cancelar" no /entrar e no dashboard). */
export type PendingEntryRequest = {
  roomId: string;
  roomCode: string;
  barName: string;
  barCode: string | null;
  mesaNumero: number | null;
  joinedAt: string;
};

/**
 * Lista os pedidos `pending` do participante com nome do bar e código da sala.
 * A RLS de `rooms` esconde a sala de quem não está `approved`, então a
 * resolução de código/nome usa o client de service role — somente leitura,
 * sem `youtube_api_key`. Bar sem vínculo (`bar_id` nulo) cai em `null`.
 */
export async function getMyEntryRequestsAction(): Promise<PendingEntryRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("room_members")
    .select("room_id, mesa_numero, joined_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("joined_at", { ascending: false });

  const rows = memberships ?? [];
  if (rows.length === 0) return [];

  const admin = createAdmin();
  const { data: rooms } = await admin
    .from("rooms")
    .select("id, code, status, bar_id")
    .in(
      "id",
      rows.map((r) => r.room_id)
    );
  const activeRooms = (rooms ?? []).filter((room) => room.status === "active");
  if (activeRooms.length === 0) return [];

  const barIds = [
    ...new Set(activeRooms.map((room) => room.bar_id).filter(Boolean)),
  ] as string[];
  const { data: bars } = barIds.length
    ? await admin.from("bars").select("id, nome, code").in("id", barIds)
    : { data: [] };
  const barsById = new Map((bars ?? []).map((bar) => [bar.id, bar]));

  const roomsById = new Map(activeRooms.map((room) => [room.id, room]));

  return rows.flatMap((row) => {
    const room = roomsById.get(row.room_id);
    if (!room) return [];
    const bar = room.bar_id ? barsById.get(room.bar_id) : undefined;
    return [
      {
        roomId: room.id,
        roomCode: room.code,
        barName: bar?.nome ?? "Karaokê",
        barCode: bar?.code ?? null,
        mesaNumero: row.mesa_numero ?? null,
        joinedAt: row.joined_at,
      },
    ];
  });
}

export type GeocodeResult =
  { ok: true; latitude: number; longitude: number } | { ok: false; error: string };

/** Geocode gratuito do endereço do bar (Nominatim/OSM, server-side). */
export async function geocodeBarAddressAction(
  address: string,
  city: string
): Promise<GeocodeResult> {
  const coords = await geocodeAddress(address, city);
  if (!coords) {
    return {
      ok: false,
      error: 'Não encontramos o endereço. Tente o botão "usar minha localização atual".',
    };
  }
  return { ok: true, latitude: coords.latitude, longitude: coords.longitude };
}

export type EnterRoomByCodeResult =
  | { ok: true; membership: EntryMembership; redirect: string }
  | { ok: false; error: string; geoRequired?: boolean };

/**
 * Entrada DIRETA por código de sala (digitado ou QR legado `?code=`): pula a
 * preview e a escolha de mesa — o cliente entra na sala SEM mesa e a mesa é
 * escolhida depois dentro da sala (mesa só vem por QR de bar/mesa). Host que
 * digita o próprio código é redirecionado à sala.
 */
export async function enterRoomByCodeAction(
  code: string
): Promise<EnterRoomByCodeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Faça login para entrar." };

  const isAnonymous =
    (user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true) === true;

  const { data: rows, error } = (await supabase.rpc("get_entry_preview", {
    p_code: code,
    p_mesa: null,
  })) as { data: unknown; error: { message: string } | null };
  if (error || !Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      error: friendlyError(error?.message ?? "", "Sala não encontrada."),
    };
  }
  const preview = rows[0] as EntryBarPreview;

  if (preview.host_id === user.id && !isAnonymous) {
    return {
      ok: true,
      membership: { status: "approved", mesa_numero: null },
      redirect: `/salas/${preview.room_code}`,
    };
  }

  const presence = requirePresence({
    isHost: false,
    bar: {
      latitude: preview.bar_latitude,
      longitude: preview.bar_longitude,
      raioPermitidoMetros: preview.bar_raio_permitido_metros,
    },
    store: await cookies(),
  });
  // Mesma regra de `joinEntryAction`: consentimento é obrigatório, estar fora do
  // raio não impede a entrada — só impede pedir música, e isso é decidido na
  // fila, não aqui.
  if (needsLocationConsent(presence)) {
    return { ok: false, error: presence.error, geoRequired: presence.geoRequired };
  }

  const { data: joinData, error: joinError } = (await supabase.rpc("join_room", {
    p_code: preview.room_code,
    p_mesa: null,
    p_fora_do_raio: isOutsideBar(presence),
    p_distancia_m: presence.distanceMeters ?? null,
  })) as { data: unknown; error: { message: string } | null };
  if (joinError) {
    return {
      ok: false,
      error: friendlyError(joinError.message, "Não foi possível entrar."),
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/entrar");
  return {
    ok: true,
    membership: readMembership(joinData) ?? {
      status: preview.entry_mode === "open" ? "approved" : "pending",
      mesa_numero: null,
    },
    redirect: `/salas/${preview.room_code}`,
  };
}
