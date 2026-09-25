import { describe, expect, it } from "vitest";

import {
  checkPresence,
  geocodeAddress,
  haversineDistanceMeters,
  PRESENCE_ERROR_GEO,
  PRESENCE_ERROR_OUTSIDE,
  withinRadius,
} from "./geo";
import { requirePresence, readUserGeoFromCookies } from "./presence";
import { createBarSchema } from "./schema";
import { GEO_COOKIE } from "@/lib/consent/cookies";

const BAR = { latitude: -23.561_3, longitude: -46.656_5 }; // São Paulo
const NO_BAR = {
  latitude: -3.119, // São Paulo → Manaus (grossamente)
  longitude: -60.021_7,
};

describe("haversineDistanceMeters", () => {
  it("retorna 0 para o mesmo ponto", () => {
    expect(haversineDistanceMeters(BAR, BAR)).toBeGreaterThanOrEqual(0);
    expect(haversineDistanceMeters(BAR, BAR)).toBeLessThan(1);
  });

  it("mede ~1º de longitude no equador como ~111 km", () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 1 };
    const distance = haversineDistanceMeters(a, b);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it("distância SP→Manaus na casa dos milhares de km", () => {
    const distance = haversineDistanceMeters(BAR, NO_BAR);
    expect(distance).toBeGreaterThan(2_000_000);
    expect(distance).toBeLessThan(3_500_000);
  });
});

describe("withinRadius", () => {
  it("aceita usuário praticamente em cima do bar", () => {
    expect(
      withinRadius({ latitude: BAR.latitude + 0.0001, longitude: BAR.longitude }, BAR, 150)
    ).toBe(true);
  });

  it("rejeita usuário a centenas de km", () => {
    expect(withinRadius(NO_BAR, BAR, 150)).toBe(false);
  });
});

describe("checkPresence (gate de presença física — Requisito)", () => {
  it("host é sempre isento", () => {
    expect(
      checkPresence({
        isHost: true,
        userCoords: null,
        barCoords: null,
        radiusMeters: null,
      })
    ).toEqual({ ok: true });
  });

  it("participante sem coords do usuário é bloqueado (geo-unavailable)", () => {
    const decision = checkPresence({
      isHost: false,
      userCoords: null,
      barCoords: BAR,
      radiusMeters: 150,
    });
    expect(decision).toEqual({ ok: false, reason: "geo-unavailable", error: PRESENCE_ERROR_GEO, geoRequired: true });
  });

  it("bloqueia quando o bar não tem localização registrada", () => {
    const decision = checkPresence({
      isHost: false,
      userCoords: NO_BAR,
      barCoords: null,
      radiusMeters: 150,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe("geo-unavailable");
  });

  it("bloqueia participante fora do raio (outside)", () => {
    const decision = checkPresence({
      isHost: false,
      userCoords: NO_BAR,
      barCoords: BAR,
      radiusMeters: 150,
    });
    expect(decision).toEqual({ ok: false, reason: "outside", error: PRESENCE_ERROR_OUTSIDE, geoRequired: true });
  });

  it("libera participante dentro do raio", () => {
    const decision = checkPresence({
      isHost: false,
      userCoords: { latitude: BAR.latitude + 0.0002, longitude: BAR.longitude },
      barCoords: BAR,
      radiusMeters: 150,
    });
    expect(decision).toEqual({ ok: true });
  });
});

describe("readUserGeoFromCookies", () => {
  const store = (geoJson: string | null) => ({ get: (name: string) => (name === GEO_COOKIE ? { value: geoJson ?? undefined } : undefined) });

  it("lê coords de geo concedida", () => {
    expect(
      readUserGeoFromCookies(store(JSON.stringify({ status: "granted", coords: BAR, ts: "x" })))
    ).toEqual(BAR);
  });

  it("ignora geo negada ou ausente", () => {
    expect(readUserGeoFromCookies(store(JSON.stringify({ status: "denied", ts: "x" })))).toBeNull();
    expect(readUserGeoFromCookies(store(null))).toBeNull();
  });
});

describe("requirePresence", () => {
  const bar = { ...BAR, raioPermitidoMetros: 150 };

  it("não exigindo coords do bar, bloqueia com geo-unavailable", () => {
    const decision = requirePresence({
      isHost: false,
      bar: { latitude: null, longitude: null, raioPermitidoMetros: 150 },
      store: { get: () => undefined },
    });
    expect(decision.ok).toBe(false);
  });

  it("libera usuário dentro do raio", () => {
    const decision = requirePresence({
      isHost: false,
      bar,
      store: {
        get: (name: string) =>
          name === GEO_COOKIE
            ? { value: JSON.stringify({ status: "granted", coords: { latitude: BAR.latitude + 0.0002, longitude: BAR.longitude }, ts: "x" }) }
            : undefined,
      },
    });
    expect(decision).toEqual({ ok: true });
  });

  it("sempre libera host (mesmo com coords erradas)", () => {
    const decision = requirePresence({
      isHost: true,
      bar,
      store: {
        get: (name: string) =>
          name === GEO_COOKIE
            ? { value: JSON.stringify({ status: "granted", coords: NO_BAR, ts: "x" }) }
            : undefined,
      },
    });
    expect(decision).toEqual({ ok: true });
  });
});

describe("geocodeAddress", () => {
  const okFetch = (): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify([{ lat: "-23.5505199", lon: "-46.6333094", display_name: "x" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

  it("resolves um endereço e arredonda as coords", async () => {
    const coords = await geocodeAddress("Praça da Sé", "São Paulo", okFetch as typeof fetch);
    expect(coords?.latitude).toBeCloseTo(-23.55, 2);
    expect(coords?.longitude).toBeCloseTo(-46.63, 2);
  });

  it("retorna null quando o geocode falha (HTTP ou vazio)", async () => {
    const failFetch = (): Promise<Response> =>
      Promise.resolve(new Response("", { status: 500 }));
    expect(await geocodeAddress("x", "y", failFetch as typeof fetch)).toBeNull();

    const emptyFetch = (): Promise<Response> =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    expect(await geocodeAddress("x", "y", emptyFetch as typeof fetch)).toBeNull();
  });

  it("retorna null sem query vazio", async () => {
    expect(await geocodeAddress("  ", "", okFetch as typeof fetch)).toBeNull();
  });
});

describe("createBarSchema — localização e raio", () => {
  it("aceita bar sem coords (localização opcional) com raio default 500", () => {
    const base = {
      nome: "Karaokê do Zé",
      cidade: "São Paulo",
      endereco: "Rua A, 1",
      quantidade_mesas: "12",
    };
    const parsed = createBarSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.latitude).toBeNull();
      expect(parsed.data.longitude).toBeNull();
      expect(parsed.data.raio_permitido_metros).toBe(500);
    }
  });

  it("aceita coords válidas e raio customizado", () => {
    const parsed = createBarSchema.safeParse({
      nome: "Bar",
      cidade: "SP",
      quantidade_mesas: 1,
      latitude: "-23.5",
      longitude: "-46.6",
      raio_permitido_metros: "300",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.latitude).toBeCloseTo(-23.5, 3);
      expect(parsed.data.raio_permitido_metros).toBe(300);
    }
  });

  it("trata string vazia de coord como null", () => {
    const parsed = createBarSchema.safeParse({
      nome: "Bar",
      cidade: "SP",
      quantidade_mesas: 1,
      latitude: "",
      longitude: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.latitude).toBeNull();
      expect(parsed.data.longitude).toBeNull();
    }
  });

  it("rejeita par de coords incompleto", () => {
    const parsed = createBarSchema.safeParse({
      nome: "Bar",
      cidade: "SP",
      quantidade_mesas: 1,
      latitude: "-23.5",
      longitude: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita raio fora de 50–1000", () => {
    expect(
      createBarSchema.safeParse({ nome: "Bar", cidade: "SP", quantidade_mesas: 1, raio_permitido_metros: "10" }).success
    ).toBe(false);
    expect(
      createBarSchema.safeParse({ nome: "Bar", cidade: "SP", quantidade_mesas: 1, raio_permitido_metros: "2000" }).success
    ).toBe(false);
  });
});