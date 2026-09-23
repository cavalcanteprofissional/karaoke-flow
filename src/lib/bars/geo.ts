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
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function withinRadius(
  user: GeoCoordinates,
  bar: GeoCoordinates,
  radiusMeters: number
): boolean {
  return haversineDistanceMeters(user, bar) <= radiusMeters;
}

export const PRESENCE_ERROR_GEO = "Precisamos da sua localização para confirmar que você está no bar.";
export const PRESENCE_ERROR_OUTSIDE = "Você precisa estar no bar para participar desta sala.";

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
    return { ok: false, reason: "outside", error: PRESENCE_ERROR_OUTSIDE, geoRequired: true };
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
  const query = [address, city].filter(Boolean).map((part) => part.trim()).join(", ");
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
        "User-Agent": "karaoke-flow/0.1 (contact: https://github.com/cavalcanteprofissional/karaoke-flow)",
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