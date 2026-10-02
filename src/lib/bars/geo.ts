import type { GeoCoordinates } from "@/lib/consent/geo";

export type BarLocation = {
  latitude: number | null;
  longitude: number | null;
  raioPermitidoMetros: number | null;
};

export type PresenceDecision =
  | { ok: true }
  | {
      ok: false;
      /** `geo-unavailable` = sem coords do usuário ou do bar; `outside` = fora do raio. */
      reason: "geo-unavailable" | "outside";
      error: string;
      /** Sinaliza o client para oferecer o fluxo de "permitir localização de novo". */
      geoRequired: true;
    };

/** O branch de bloqueio: tem `error` e `geoRequired` para o client usar. */
export type PresenceBlocked = Extract<PresenceDecision, { ok: false }>;
/** Bloqueio por falta de consentimento/coords — o único que exige o gate. */
export type GeoUnavailableDecision = PresenceBlocked & { reason: "geo-unavailable" };
/** Bloqueio por estar longe: assiste, mas não participa. */
export type OutsideDecision = PresenceBlocked & { reason: "outside" };

const EARTH_RADIUS_METERS = 6_371_000;

export function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function haversineDistanceMeters(a: GeoCoordinates, b: GeoCoordinates): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.longitude) - toRadians(a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function withinRadius(
  user: GeoCoordinates,
  bar: GeoCoordinates,
  radiusMeters: number
): boolean {
  return haversineDistanceMeters(user, bar) <= radiusMeters;
}

/**
 * Passo dos anéis de metragem desenhados sobre o mapa do raio: quanto menor o
 * raio, mais fino o passo — assim o mapa sempre mostra alguma referência sem
 * virar um rosca de linhas.
 */
export function radiusTickStep(radiusMeters: number): number {
  if (radiusMeters <= 100) return 25;
  if (radiusMeters <= 300) return 50;
  if (radiusMeters <= 600) return 100;
  return 200;
}

/**
 * Metragens dos anéis internos do mapa (HUD/sprites). O anel de fora é o próprio
 * círculo do raio, desenhado pelo Leaflet — aqui ficam só as referências
 * intermediárias, que nunca passam do raio.
 */
export function radiusTicks(
  radiusMeters: number,
  stepMeters: number = radiusTickStep(radiusMeters)
): number[] {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return [];
  const step =
    Number.isFinite(stepMeters) && stepMeters > 0
      ? stepMeters
      : radiusTickStep(radiusMeters);
  const ticks: number[] = [];
  for (let meters = step; meters < radiusMeters; meters += step) {
    ticks.push(meters);
  }
  return ticks;
}

export const PRESENCE_ERROR_GEO =
  "Precisamos da sua localização para confirmar que você está no bar.";
export const PRESENCE_ERROR_OUTSIDE =
  "Você precisa estar no bar para participar desta sala.";

/** O que o visitante fora do raio ainda pode fazer depois de entrar. */
export const PRESENCE_VIEWER_NOTICE =
  "Você está fora do bar: pode assistir ao karaokê, mas não pode pedir músicas.";

/**
 * Quem pode ENTRAR na sala. Quem pode PEDIR música é outra pergunta, com a
 * resposta mais apertada: `buildQueueSongItem` (`src/lib/rooms/queue.ts`) exige
 * estar dentro do raio. Aqui a régua é só o consentimento.
 *
 *   - `geo-unavailable` (sem coords do usuário, ou bar sem raio/coords): sem o
 *     cookie de localização não dá nem para saber onde a pessoa está, então a
 *     entrada fica presa até ela aceitar. O consentimento é obrigatório.
 *   - `outside` (tem coordenadas, está genuinamente longe): **não** impede a
 *     entrada. A pessoa assiste ao player de onde está, sem mesa.
 *
 * Antes, os dois bloqueavam igual e quem estava fora do bar não conseguia nem
 * escolher a mesa — ficava preso na tela de entrada sem caminho possível.
 */
export function canEnterAsViewer(presence?: PresenceDecision): boolean {
  return !presence || presence.ok || presence.reason === "outside";
}

/**
 * `true` só quando a falta é de consentimento/coord — aí a entrada precisa do gate.
 *
 * Type predicate de propósito: quem chama precisa chegar em `presence.error`
 * logo abaixo (`needsLocationConsent(p) && p.error`), e um `boolean` nu deixaria
 * o TS reclamar de `.error` num tipo que não tem esse campo.
 */
export function needsLocationConsent(
  presence?: PresenceDecision
): presence is GeoUnavailableDecision {
  return !!presence && !presence.ok && presence.reason === "geo-unavailable";
}

/** `true` quando a pessoa entrou de fora: entra sem mesa e sem poder pedir. */
export function isOutsideBar(presence?: PresenceDecision): presence is OutsideDecision {
  return !!presence && !presence.ok && presence.reason === "outside";
}

/**
 * Decisão do gate de presença física (regra pura — sem I/O).
 * Host é sempre isento. Participante precisa de coords do usuário E do bar
 * (sem elas => geo-unavailable) dentro do raio.
 */
export function checkPresence(params: {
  isHost: boolean;
  userCoords: GeoCoordinates | null;
  barCoords: GeoCoordinates | null;
  radiusMeters: number | null;
}): PresenceDecision {
  const { isHost, userCoords, barCoords, radiusMeters } = params;
  if (isHost) return { ok: true };

  if (!userCoords || !barCoords || radiusMeters === null) {
    return {
      ok: false,
      reason: "geo-unavailable",
      error: PRESENCE_ERROR_GEO,
      geoRequired: true,
    };
  }

  if (!withinRadius(userCoords, barCoords, radiusMeters)) {
    return {
      ok: false,
      reason: "outside",
      error: PRESENCE_ERROR_OUTSIDE,
      geoRequired: true,
    };
  }

  return { ok: true };
}

type NominatimResponse = Array<{
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
}>;

/**
 * Geocodifica um endereço via OpenStreetMap Nominatim (gratuito, sem chave).
 * Deve ser chamado no servidor (política de uso do Nominatim). Retorna null
 * quando não resolve. `fetchFn` injetável para testes.
 */
export async function geocodeAddress(
  address: string,
  city: string,
  fetchFn: typeof fetch = fetch
): Promise<GeoCoordinates | null> {
  const query = [address, city]
    .filter(Boolean)
    .map((part) => part.trim())
    .join(", ");
  if (!query) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");

  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "karaoke-flow/0.1 (contact: https://github.com/cavalcanteprofissional/karaoke-flow)",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  try {
    const body = (await response.json()) as NominatimResponse;
    const first = Array.isArray(body) ? body[0] : undefined;
    if (!first) return null;
    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude: roundCoord(latitude), longitude: roundCoord(longitude) };
  } catch {
    return null;
  }
}

function roundCoord(value: number): number {
  const factor = 100_000; // 5 casas (~1 m de precisão prática)
  return Math.round(value * factor) / factor;
}
