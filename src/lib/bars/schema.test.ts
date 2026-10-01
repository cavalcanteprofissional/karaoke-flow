import { describe, expect, it } from "vitest";

import {
  barRadiusInputSchema,
  barRadiusSchema,
  createRoomSchema,
} from "./schema";
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

const BAR_ID = "20000000-0000-0000-0000-000000000001";

describe("createRoomSchema — 2ª sala dentro de um bar existente", () => {
  it("aceita só o bar_id e deixa o código para o banco resolver", () => {
    const parsed = createRoomSchema.safeParse({ bar_id: BAR_ID });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // `undefined` (e não string vazia) — a action manda `?? null` para a RPC,
      // e é a `unique_room_code` que escolhe o código livre (KARAOKE2, ...).
      expect(parsed.data.codigo_entrada).toBeUndefined();
    }
  });

  it("normaliza o código para maiúsculas", () => {
    const parsed = createRoomSchema.safeParse({
      bar_id: BAR_ID,
      codigo_entrada: "  karaoke2 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.codigo_entrada).toBe("KARAOKE2");
    }
  });

  it("trata string vazia como 'sem código' (não como erro)", () => {
    const parsed = createRoomSchema.safeParse({ bar_id: BAR_ID, codigo_entrada: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.codigo_entrada).toBeUndefined();
    }
  });

  it("exige bar_id em formato uuid", () => {
    expect(createRoomSchema.safeParse({ bar_id: "nao-e-uuid" }).success).toBe(false);
    expect(createRoomSchema.safeParse({}).success).toBe(false);
  });

  it("aplica as mesmas regras de 3–12 alfanuméricos do código do bar", () => {
    // curta demais
    expect(createRoomSchema.safeParse({ bar_id: BAR_ID, codigo_entrada: "ab" }).success).toBe(
      false
    );
    // longa demais
    expect(
      createRoomSchema.safeParse({ bar_id: BAR_ID, codigo_entrada: "A".repeat(13) }).success
    ).toBe(false);
    // com acento/espaço é normalizada antes do regex; o que sobra inválido reprova
    expect(
      createRoomSchema.safeParse({ bar_id: BAR_ID, codigo_entrada: "!!" }).success
    ).toBe(false);
  });
});
