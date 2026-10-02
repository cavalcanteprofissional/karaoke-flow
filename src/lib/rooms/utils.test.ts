import { describe, expect, it, vi } from "vitest";

import {
  deriveRoomCodeFromName,
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
  it("valida 3–12 caracteres alfanuméricos", () => {
    expect(isValidRoomCode("KARAOK")).toBe(true);
    expect(isValidRoomCode("BAR2FO")).toBe(true);
    expect(isValidRoomCode("KARAOKE")).toBe(true);
    expect(isValidRoomCode("KAR")).toBe(true);
    expect(isValidRoomCode("KARAOKE1234Z")).toBe(true);
  });

  it("rejeita tamanhos e caracteres inválidos", () => {
    expect(isValidRoomCode("AB")).toBe(false);
    expect(isValidRoomCode("KARAOKE1234ZZZ")).toBe(false);
    expect(isValidRoomCode("KAR OO")).toBe(false);
    expect(isValidRoomCode("")).toBe(false);
  });
});

describe("deriveRoomCodeFromName", () => {
  it("deriva o código do nome do bar (maiúsculas, sem acentos/espaços)", () => {
    expect(deriveRoomCodeFromName("Karaokê do Zé")).toBe("KARAOKEDOZE");
    expect(deriveRoomCodeFromName("Bar da Esquina")).toBe("BARDAESQUINA");
  });

  it("trunca em 12 caracteres", () => {
    expect(deriveRoomCodeFromName("Estabelecimento Grandioso Central")).toBe(
      "ESTABELECIME"
    );
  });

  it("retorna null quando não sobra nada válido (nome curto/sem letras)", () => {
    expect(deriveRoomCodeFromName("Zé")).toBeNull();
    expect(deriveRoomCodeFromName("!!! 123")).toBe("123");
    expect(deriveRoomCodeFromName("")).toBeNull();
  });
});

describe("extractRoomCodeFromQr", () => {
  it("aceita o código puro do QR", () => {
    expect(extractRoomCodeFromQr("KARAOK")).toBe("KARAOK");
    expect(extractRoomCodeFromQr("KARAOKE")).toBe("KARAOKE");
  });

  it("aceita a URL de entrada da sala", () => {
    expect(extractRoomCodeFromQr("https://karaoke.app/entrar?code=BAR2FO")).toBe(
      "BAR2FO"
    );
  });

  it("ignora URLs sem código ou com código inválido", () => {
    expect(extractRoomCodeFromQr("https://example.com/x")).toBeNull();
    expect(extractRoomCodeFromQr("https://example.com/entrar?code=AB")).toBeNull();
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

  /**
   * Regressão do bug do QR da TV: sem base explícita, a base era
   * `NEXT_PUBLIC_APP_URL` (build-time) e, com a env faltando, virava
   * `http://localhost:3000` — a TV gerava um QR que só funcionava na máquina
   * dela. Aqui o host é stubado para provar que o QR segue o host servido.
   */
  it("segue o host de origem em vez da env de build", () => {
    vi.stubGlobal("window", { location: { origin: "https://preview-abc.vercel.app" } });
    try {
      expect(roomJoinUrl("KARAOK")).toBe(
        "https://preview-abc.vercel.app/entrar?code=KARAOK"
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("normaliza barra final na base explícita", () => {
    expect(roomJoinUrl("ABC123", "https://karaoke-flow.vercel.app/")).toBe(
      "https://karaoke-flow.vercel.app/entrar?code=ABC123"
    );
  });
});
