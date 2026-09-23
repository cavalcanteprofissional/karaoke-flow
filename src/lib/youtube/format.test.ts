import { describe, expect, it } from "vitest";

import { formatDurationSeconds } from "./format";

describe("formatDurationSeconds", () => {
  it("formata apenas minutos", () => {
    expect(formatDurationSeconds(225)).toBe("3:45");
  });

  it("adiciona zero à esquerda nos segundos", () => {
    expect(formatDurationSeconds(300)).toBe("5:00");
  });

  it("inclui horas quando vídeo é longo", () => {
    expect(formatDurationSeconds(3723)).toBe("1:02:03");
  });

  it("zero vira 0:00", () => {
    expect(formatDurationSeconds(0)).toBe("0:00");
  });

  it("null/undefined/inválido retornam null", () => {
    expect(formatDurationSeconds(null)).toBeNull();
    expect(formatDurationSeconds(undefined)).toBeNull();
    expect(formatDurationSeconds(-1)).toBeNull();
  });
});