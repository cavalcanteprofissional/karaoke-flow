import { describe, expect, it } from "vitest";

import {
  extractRoomCodeFromQr,
  isValidRoomCode,
  normalizeRoomCode,
  roomJoinUrl,
} from "./utils";

describe("normalizeRoomCode", () => {
  it("corta espaços e força maiúsculas", () => {
    expect(normalizeRoomCode("  karaok ")).toBe("KARAOK");
    expect(normalizeRoomCode("bar2fo")).toBe("BAR2FO");
  });
});

describe("isValidRoomCode", () => {
  it("valida 6 caracteres alfanuméricos", () => {
    expect(isValidRoomCode("KARAOK")).toBe(true);
    expect(isValidRoomCode("BAR2FO")).toBe(true);
  });

  it("rejeita tamanhos e caracteres inválidos", () => {
    expect(isValidRoomCode("KAR")).toBe(false);
    expect(isValidRoomCode("KARAOKE")).toBe(false);
    expect(isValidRoomCode("KAR OO")).toBe(false);
    expect(isValidRoomCode("")).toBe(false);
  });
});

describe("extractRoomCodeFromQr", () => {
  it("aceita o código puro do QR", () => {
    expect(extractRoomCodeFromQr("KARAOK")).toBe("KARAOK");
  });

  it("aceita a URL de entrada da sala", () => {
    expect(extractRoomCodeFromQr("https://karaoke.app/entrar?code=BAR2FO")).toBe(
      "BAR2FO"
    );
  });

  it("ignora URLs sem código ou com código inválido", () => {
    expect(extractRoomCodeFromQr("https://example.com/x")).toBeNull();
    expect(extractRoomCodeFromQr("https://example.com/entrar?code=ABC")).toBeNull();
  });

  it("rejeita texto aleatório", () => {
    expect(extractRoomCodeFromQr("apenas um texto")).toBeNull();
  });
});

describe("roomJoinUrl", () => {
  it("monta a URL de entrada com o código", () => {
    expect(roomJoinUrl("KARAOK", "http://localhost:3000/")).toBe(
      "http://localhost:3000/entrar?code=KARAOK"
    );
  });
});
