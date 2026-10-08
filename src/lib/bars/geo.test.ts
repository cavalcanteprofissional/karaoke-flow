import { describe, expect, it } from "vitest";

import {
  canEnterAsViewer,
  checkPresence,
  geocodeAddress,
  haversineDistanceMeters,
  isOutsideBar,
  needsLocationConsent,
  PRESENCE_ERROR_GEO,
  PRESENCE_ERROR_OUTSIDE,
  radiusTickStep,
  radiusTicks,
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
      withinRadius(
        { latitude: BAR.latitude + 0.0001, longitude: BAR.longitude },
        BAR,
        150
      )
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
    expect(decision).toEqual({
      ok: false,
      reason: "geo-unavailable",
      error: PRESENCE_ERROR_GEO,
      geoRequired: true,
    });
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
    expect(decision).toMatchObject({
      ok: false,
      reason: "outside",
      error: PRESENCE_ERROR_OUTSIDE,
      geoRequired: true,
    });
    // A metragem é o que a migration 00040 grava em `room_members.distancia_m`:
    // sem ela o card do host mostraria "fora do raio" sem explicação.
    if (!decision.ok) {
      expect(decision.distanceMeters).toBeGreaterThan(150);
    }
  });

  it("libera participante dentro do raio", () => {
    const decision = checkPresence({
      isHost: false,
      userCoords: { latitude: BAR.latitude + 0.0002, longitude: BAR.longitude },
      barCoords: BAR,
      radiusMeters: 150,
    });
    // 0.0002° de latitude ≈ 22,24 m — dentro do raio, e a metragem volta junto
    // para o `join_room` guardar. Inteira: 22 m, porque `distancia_m` é `integer`.
    expect(decision).toEqual({ ok: true, distanceMeters: 22 });
  });

  /**
   * O P0 de 04/10: a distância ia fracionária para o `join_room`, cuja
   * `p_distancia_m` é `int`, e o Postgres recusava a **entrada** com
   * `invalid input syntax for type integer: "42.4732269333666"`. Como o host é
   * isento (não produz distância) e os smokes chamam o SQL com literal inteiro,
   * suíte e banco ficavam verdes e o defeito só aparecia no aparelho — para
   * qualquer participante, dentro ou fora do raio. Estes casos existem para o
   * contrato "metros inteiros" não voltar a ser implícito.
   */
  it("devolve a distância em metros inteiros nos dois ramos (contrato do banco)", () => {
    const dentro = checkPresence({
      isHost: false,
      userCoords: { latitude: BAR.latitude + 0.0002, longitude: BAR.longitude },
      barCoords: BAR,
      radiusMeters: 150,
    });
    expect(dentro.ok).toBe(true);
    expect(Number.isInteger(dentro.distanceMeters)).toBe(true);

    const fora = checkPresence({
      isHost: false,
      userCoords: NO_BAR,
      barCoords: BAR,
      radiusMeters: 150,
    });
    expect(fora.ok).toBe(false);
    if (!fora.ok) {
      expect(fora.reason).toBe("outside");
      expect(Number.isInteger(fora.distanceMeters)).toBe(true);
      expect(fora.distanceMeters).toBeGreaterThan(150);
    }
  });

  it("arredonda para 0 quem está a menos de meio metro do bar", () => {
    // Coordenada idêntica é o caso-limite: o haversine dá 0 exato, e uma
    // diferença de meio metro já tem que virar 0 (e não 0,5 — que o banco recusa).
    const decision = checkPresence({
      isHost: false,
      userCoords: BAR,
      barCoords: BAR,
      radiusMeters: 150,
    });
    expect(decision).toEqual({ ok: true, distanceMeters: 0 });
  });
});

describe("readUserGeoFromCookies", () => {
  const store = (geoJson: string | null) => ({
    get: (name: string) =>
      name === GEO_COOKIE ? { value: geoJson ?? undefined } : undefined,
  });

  it("lê coords de geo concedida", () => {
    expect(
      readUserGeoFromCookies(
        store(JSON.stringify({ status: "granted", coords: BAR, ts: "x" }))
      )
    ).toEqual(BAR);
  });

  it("ignora geo negada ou ausente", () => {
    expect(
      readUserGeoFromCookies(store(JSON.stringify({ status: "denied", ts: "x" })))
    ).toBeNull();
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
            ? {
                value: JSON.stringify({
                  status: "granted",
                  coords: { latitude: BAR.latitude + 0.0002, longitude: BAR.longitude },
                  ts: "x",
                }),
              }
            : undefined,
      },
    });
    expect(decision).toEqual({ ok: true, distanceMeters: 22 });
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
      new Response(
        JSON.stringify([{ lat: "-23.5505199", lon: "-46.6333094", display_name: "x" }]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

  it("resolves um endereço e arredonda as coords", async () => {
    const coords = await geocodeAddress(
      "Praça da Sé",
      "São Paulo",
      okFetch as typeof fetch
    );
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
      // 10 é o teto da Fase 16; o teste é da localização, não do limite.
      quantidade_mesas: "10",
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
      createBarSchema.safeParse({
        nome: "Bar",
        cidade: "SP",
        quantidade_mesas: 1,
        raio_permitido_metros: "10",
      }).success
    ).toBe(false);
    expect(
      createBarSchema.safeParse({
        nome: "Bar",
        cidade: "SP",
        quantidade_mesas: 1,
        raio_permitido_metros: "2000",
      }).success
    ).toBe(false);
  });
});
describe("radiusTicks (anéis do mapa do raio)", () => {
  it("afina o passo conforme o raio", () => {
    expect(radiusTickStep(50)).toBe(25);
    expect(radiusTickStep(100)).toBe(25);
    expect(radiusTickStep(300)).toBe(50);
    expect(radiusTickStep(500)).toBe(100);
    expect(radiusTickStep(1000)).toBe(200);
  });

  it("lista os anéis internos, sem repetir a borda do raio", () => {
    expect(radiusTicks(500)).toEqual([100, 200, 300, 400]);
    expect(radiusTicks(50)).toEqual([25]);
  });

  it("nunca passa do raio", () => {
    for (const radius of [50, 75, 250, 500, 1000]) {
      expect(radiusTicks(radius).every((meters) => meters < radius)).toBe(true);
    }
  });

  it("aceita passo explícito e ignora passo inválido", () => {
    expect(radiusTicks(500, 250)).toEqual([250]);
    expect(radiusTicks(500, 0)).toEqual([100, 200, 300, 400]);
  });

  it("devolve lista vazia para raio ausente ou inválido", () => {
    expect(radiusTicks(0)).toEqual([]);
    expect(radiusTicks(-100)).toEqual([]);
    expect(radiusTicks(Number.NaN)).toEqual([]);
  });
});

describe("canEnterAsViewer", () => {
  it("libera quem está ok", () => {
    expect(canEnterAsViewer({ ok: true })).toBe(true);
  });

  it("libera quem está fora do raio: assiste sem mesa", () => {
    expect(
      canEnterAsViewer({
        ok: false,
        reason: "outside",
        error: PRESENCE_ERROR_OUTSIDE,
        geoRequired: true,
      })
    ).toBe(true);
  });

  it("bloqueia quem não aceitou a localização", () => {
    expect(
      canEnterAsViewer({
        ok: false,
        reason: "geo-unavailable",
        error: PRESENCE_ERROR_GEO,
        geoRequired: true,
      })
    ).toBe(false);
  });

  it("libera quem não tem decisão de presença (host)", () => {
    expect(canEnterAsViewer(undefined)).toBe(true);
  });
});

describe("needsLocationConsent", () => {
  it("só é true para geo-unavailable", () => {
    expect(needsLocationConsent({ ok: true })).toBe(false);
    expect(
      needsLocationConsent({
        ok: false,
        reason: "outside",
        error: PRESENCE_ERROR_OUTSIDE,
        geoRequired: true,
      })
    ).toBe(false);
    expect(
      needsLocationConsent({
        ok: false,
        reason: "geo-unavailable",
        error: PRESENCE_ERROR_GEO,
        geoRequired: true,
      })
    ).toBe(true);
  });
});

describe("isOutsideBar", () => {
  it("só é true para outside", () => {
    expect(isOutsideBar({ ok: true })).toBe(false);
    expect(
      isOutsideBar({
        ok: false,
        reason: "outside",
        error: PRESENCE_ERROR_OUTSIDE,
        geoRequired: true,
      })
    ).toBe(true);
    expect(
      isOutsideBar({
        ok: false,
        reason: "geo-unavailable",
        error: PRESENCE_ERROR_GEO,
        geoRequired: true,
      })
    ).toBe(false);
    expect(isOutsideBar(undefined)).toBe(false);
  });
});
