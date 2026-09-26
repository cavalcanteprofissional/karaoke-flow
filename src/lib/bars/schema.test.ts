import { describe, expect, it } from "vitest";

import { barRadiusInputSchema, barRadiusSchema } from "./schema";
import { RAIO_MAX_METROS, RAIO_MIN_METROS, RAIO_PADRAO_METROS } from "@/types/bar";

describe("barRadiusSchema", () => {
  it("aceita as bordas da faixa do banco (50–1000 m)", () => {
    expect(barRadiusSchema.safeParse(RAIO_MIN_METROS).success).toBe(true);
    expect(barRadiusSchema.safeParse(RAIO_MAX_METROS).success).toBe(true);
  });

  it("aceita string do formulário e devolve número", () => {
    const parsed = barRadiusSchema.safeParse("300");
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe(300);
  });

  it("recusa fora da faixa com a mensagem do limite", () => {
    const low = barRadiusSchema.safeParse(49);
    expect(low.success).toBe(false);
    expect(low.success === false && low.error.errors[0].message).toMatch(
      new RegExp(`raio mínimo é ${RAIO_MIN_METROS} m`, "i")
    );

    const high = barRadiusSchema.safeParse(1001);
    expect(high.success).toBe(false);
    expect(high.success === false && high.error.errors[0].message).toMatch(
      new RegExp(`raio máximo é ${RAIO_MAX_METROS} m`, "i")
    );
  });

  it("recusa campo vazio e valor fracionário", () => {
    expect(barRadiusSchema.safeParse("").success).toBe(false);
    expect(barRadiusSchema.safeParse("   ").success).toBe(false);
    expect(barRadiusSchema.safeParse(120.5).success).toBe(false);
    expect(barRadiusSchema.safeParse("abc").success).toBe(false);
  });

  it("com default, usa 500 m quando o host não informa", () => {
    const parsed = barRadiusInputSchema.safeParse(undefined);
    expect(parsed.success && parsed.data).toBe(RAIO_PADRAO_METROS);
  });
});
