import { GEO_COOKIE } from "@/lib/consent/cookies";
import type { GeoCoordinates, GeoResult } from "@/lib/consent/geo";
import { checkPresence, type BarLocation, type PresenceDecision } from "@/lib/bars/geo";

/** Assinatura estrutural mínima do cookie store de `next/headers` (server actions). */
export type CookieStoreLike = {
  get(name: string): { value?: string } | undefined;
};

/** Lê as coords do participante do cookie `kf-geo` (gravado sob consentimento §2.5). */
export function readUserGeoFromCookies(store: CookieStoreLike): GeoCoordinates | null {
  const raw = store.get(GEO_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GeoResult;
    if (parsed && parsed.status === "granted" && parsed.coords) return parsed.coords;
  } catch {
    // cookie corrompido/antigo — tratar como ausente
  }
  return null;
}

/**
 * Gate de presença física (server-side). Host isento; participante precisa
 * estar dentro do raio do bar (comparação GPS x localização cadastrada).
 */
export function requirePresence(params: {
  isHost: boolean;
  bar: BarLocation;
  store: CookieStoreLike;
}): PresenceDecision {
  const { isHost, bar, store } = params;
  const userCoords = readUserGeoFromCookies(store);
  return checkPresence({
    isHost,
    userCoords,
    barCoords: bar.latitude !== null && bar.longitude !== null ? { latitude: bar.latitude, longitude: bar.longitude } : null,
    radiusMeters: bar.raioPermitidoMetros,
  });
}