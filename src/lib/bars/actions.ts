"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createBarSchema, type CreateBarInput } from "@/lib/bars/schema";
import { requirePresence } from "@/lib/bars/presence";
import { geocodeAddress, type PresenceDecision } from "@/lib/bars/geo";
import type { EntryBarPreview } from "@/types/bar";
import type { MemberStatus } from "@/types/room";

type CreateBarRpcRow = {
  bar_id: string;
  bar_code: string;
  room_id: string;
  room_code: string;
};

function friendlyError(message: string, fallback: string): string {
  if (/row-level security|permission denied|policy/i.test(message)) return fallback;
  if (/não autenticado/i.test(message)) return "Faça login para entrar.";
  if (/bar não encontrado/i.test(message)) return "Bar não encontrado.";
  if (/sala não encontrada|inativa/i.test(message))
    return "Sala não encontrada ou inativa.";
  if (/mesa inválida|mesa não existe/i.test(message))
    return "Mesa inválida para este bar.";
  if (/escolha uma mesa/i.test(message)) return "Escolha uma mesa para entrar.";
  if (/crie uma conta/i.test(message))
    return "Crie uma conta para criar o seu bar.";
  if (/localização incompleta|latitude inválida|longitude inválida/i.test(message))
    return "Localização do bar inválida.";
  if (/raio de presença inválido/i.test(message))
    return "Raio de presença inválido (50–1000 m).";
  return message;
}

export type CreateBarResult =
  | { ok: true; bar: { id: string; code: string; room_code: string } }
  | { ok: false; error: string };

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
    })
    .single()) as { data: CreateBarRpcRow | null; error: { message: string } | null };

  if (error) {
    return { ok: false, error: friendlyError(error.message, "Não foi possível criar o bar.") };
  }
  if (!data) {
    return { ok: false, error: "Não foi possível criar o bar." };
  }

  revalidatePath("/dashboard");
  return { ok: true, bar: { id: data.bar_id, code: data.bar_code, room_code: data.room_code } };
}

export type EntryPreviewResult =
  | { preview: EntryBarPreview; mesa?: number; presence?: PresenceDecision }
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

  const isAnonymous = (user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true) === true;
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

  return { preview: first, mesa: first.mesa_numero ?? undefined, presence };
}

export type JoinEntryResult =
  | { ok: true; membership: { status: MemberStatus } }
  | { ok: false; error: string; geoRequired?: boolean };

/** Entra na sala do bar. `roomCode` é o código da sala resolvida na preview. */
export async function joinEntryAction(
  roomCode: string,
  mesa: number
): Promise<JoinEntryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Faça login para entrar." };

  const isAnonymous = (user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true) === true;

  const { data: previewRows, error: previewError } = (await supabase.rpc(
    "get_entry_preview",
    { p_code: roomCode, p_mesa: mesa }
  )) as { data: unknown; error: { message: string } | null };
  if (previewError || !Array.isArray(previewRows) || previewRows.length === 0) {
    return { ok: false, error: friendlyError(previewError?.message ?? "", "Sala não encontrada.") };
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
  if (!presence.ok) {
    return { ok: false, error: presence.error, geoRequired: presence.geoRequired };
  }

  const { data, error } = (await supabase.rpc("join_room", {
    p_code: roomCode,
    p_mesa: mesa,
  })) as { data: unknown; error: { message: string } | null };
  if (error) {
    return { ok: false, error: friendlyError(error.message, "Não foi possível entrar.") };
  }
  const membership = (Array.isArray(data) ? data[0] : data) as { status?: MemberStatus };
  revalidatePath("/dashboard");
  revalidatePath("/entrar");
  return { ok: true, membership: { status: membership?.status ?? "pending" } };
}

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; error: string };

/** Geocode gratuito do endereço do bar (Nominatim/OSM, server-side). */
export async function geocodeBarAddressAction(
  address: string,
  city: string
): Promise<GeocodeResult> {
  const coords = await geocodeAddress(address, city);
  if (!coords) {
    return {
      ok: false,
      error: "Não encontramos o endereço. Tente o botão \"usar minha localização atual\".",
    };
  }
  return { ok: true, latitude: coords.latitude, longitude: coords.longitude };
}