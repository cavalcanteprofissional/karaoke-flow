import { describe, expect, it, vi } from "vitest";

import { GEO_COOKIE, setCookie } from "./cookies";

import {
  readGeoCookie,
  writeGeoCookie,
  roundCoords,
  captureGeolocation,
  type GeoResult,
} from "./geo";

describe("roundCoords", () => {
  it("arredonda para 3 casas decimais", () => {
    expect(roundCoords(-22.9045397)).toBe(-22.905);
    expect(roundCoords(-43.176162)).toBe(-43.176);
    expect(roundCoords(0.0004)).toBe(0);
  });
});

describe("captureGeolocation", () => {
  it("resolve unavailable quando a API não existe", async () => {
    const geo = await captureGeolocation(8000, undefined);
    expect(geo.status).toBe("unavailable");
    expect(geo.coords).toBeUndefined();
  });

  it("resolve denied quando a permissão é negada", async () => {
    const getCurrentPosition = vi.fn(
      (_success: unknown, error: (err: GeolocationPositionError) => void) => {
        const err = {
          code: 1,
          PERMISSION_DENIED: 1,
          message: "denied",
        } as GeolocationPositionError;
        error(err);
      }
    );
    const geo = await captureGeolocation(8000, getCurrentPosition);
    expect(geo.status).toBe("denied");
  });

  it("resolve granted com coords arredondadas", async () => {
    const getCurrentPosition = vi.fn((success: (pos: GeolocationPosition) => void) => {
      success({
        coords: {
          latitude: -22.9045397,
          longitude: -43.176162,
        } as GeolocationCoordinates,
        timestamp: 123,
      } as GeolocationPosition);
    });
    const geo = await captureGeolocation(8000, getCurrentPosition);
    expect(geo.status).toBe("granted");
    expect(geo.coords).toEqual({ latitude: -22.905, longitude: -43.176 });
    expect(geo.ts).toBeDefined();
  });
});

describe("geo cookie", () => {
  it("ignora json inválido", () => {
    setCookie(GEO_COOKIE, "{corrompido");
    expect(readGeoCookie()).toBeNull();
  });

  it("grava e lê resultado", () => {
    const geo: GeoResult = {
      status: "denied",
      ts: "2026-09-21T00:00:00.000Z",
    };
    writeGeoCookie(geo);
    expect(readGeoCookie()).toEqual(geo);
  });
});
