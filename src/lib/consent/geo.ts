import { GEO_COOKIE, getCookie, setCookie } from "./cookies";

export type GeoStatus = "granted" | "denied" | "unavailable";

export type GeoCoordinates = {
  latitude: number;
  longitude: number;
};

export type GeoResult = {
  status: GeoStatus;
  coords?: GeoCoordinates;
  ts: string;
};
export function roundCoords(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type GetCurrentPositionFn = (
  success: (position: GeolocationPosition) => void,
  error: (error: GeolocationPositionError) => void,
  options?: PositionOptions
) => void;

function resolveGetCurrentPosition(): GetCurrentPositionFn | undefined {
  if (
    typeof navigator === "undefined" ||
    !navigator.geolocation ||
    typeof navigator.geolocation.getCurrentPosition !== "function"
  ) {
    return undefined;
  }
  return navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
}

/**
 * Solicita a localização aproximada do dispositivo. Resolve sempre com um
 * GeoResult válido (granted/denied/unavailable), sem lançar. O segundo
 * argumento é usado apenas em testes (injeção).
 */
export function captureGeolocation(
  timeoutMs = 8000,
  getCurrentPosition = resolveGetCurrentPosition()
): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!getCurrentPosition) {
      resolve({ status: "unavailable", ts: new Date().toISOString() });
      return;
    }

    const onSuccess = (position: GeolocationPosition): void => {
      resolve({
        status: "granted",
        coords: {
          latitude: roundCoords(position.coords.latitude),
          longitude: roundCoords(position.coords.longitude),
        },
        ts: new Date().toISOString(),
      });
    };

    const onError = (error: GeolocationPositionError): void => {
      resolve({
        status:
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        ts: new Date().toISOString(),
      });
    };

    getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 5 * 60 * 1000,
    });
  });
}

export function readGeoCookie(): GeoResult | null {
  const raw = getCookie(GEO_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GeoResult;
    if (parsed && typeof parsed === "object" && "status" in parsed) return parsed;
  } catch {
    // cookie corrompido/antigo — tratar como ausente
  }
  return null;
}

export function writeGeoCookie(geo: GeoResult): void {
  setCookie(GEO_COOKIE, JSON.stringify(geo));
}
