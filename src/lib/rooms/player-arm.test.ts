import { afterEach, describe, expect, it, vi } from "vitest";

import {
  playerArmKey,
  readPlayerArmed,
  readPlayerArmedOnServer,
  resetPlayerArmInMemory,
  setPlayerArmed,
} from "./player-arm";

const ROOM = "KARAOKE";

/** Deixa o `localStorage` explodir em qualquer acesso, como numa TV restrita. */
function breakLocalStorage() {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("storage bloqueado", "SecurityError");
    },
  });
  return () => {
    if (original) Object.defineProperty(window, "localStorage", original);
  };
}

afterEach(() => {
  window.localStorage.clear();
  resetPlayerArmInMemory();
  vi.restoreAllMocks();
});

describe("playerArmKey", () => {
  it("é por sala: travar a TV de um cômodo não afeta o bar de outro", () => {
    expect(playerArmKey(ROOM)).toBe(`kf:player-armed:${ROOM}`);
    expect(playerArmKey(ROOM)).not.toBe(playerArmKey("OUTRA"));
  });
});

describe("readPlayerArmedOnServer", () => {
  it("é sempre false: é o que o servidor renderizou", () => {
    // A invariante que o hydration exige. Se alguém um dia "melhorar" isto para
    // devolver o valor do storage, o SSR volta a mandar uma árvore diferente da
    // que o cliente hydrata — que foi o bug do gate na primeira versão.
    expect(readPlayerArmedOnServer()).toBe(false);
  });
});

describe("setPlayerArmed / readPlayerArmed", () => {
  it("arma e trava a TV na chave da sala", () => {
    expect(readPlayerArmed(ROOM)).toBe(false);

    setPlayerArmed(ROOM, true);
    expect(readPlayerArmed(ROOM)).toBe(true);
    expect(window.localStorage.getItem(playerArmKey(ROOM))).toBe("1");

    setPlayerArmed(ROOM, false);
    expect(readPlayerArmed(ROOM)).toBe(false);
    expect(window.localStorage.getItem(playerArmKey(ROOM))).toBeNull();
  });

  it("uma sala armada não arma a outra", () => {
    setPlayerArmed(ROOM, true);

    expect(readPlayerArmed("OUTRA")).toBe(false);
  });

  it("avisa os assinantes, porque o `storage` não dispara na aba que escreveu", () => {
    // Sem este evento, o clique no botão do gate não re-renderizaria a tela.
    const onStoreChange = vi.fn();
    window.addEventListener("kf:player-arm", onStoreChange);

    setPlayerArmed(ROOM, true);

    expect(onStoreChange).toHaveBeenCalledTimes(1);
    window.removeEventListener("kf:player-arm", onStoreChange);
  });

  it("sem storage, a sessão funciona igual (a memória segura o 'armado')", () => {
    const restore = breakLocalStorage();
    try {
      setPlayerArmed(ROOM, true);

      // O ponto é este: sem a memória, o clique seria engolido e a TV ficaria
      // presa na tela de "começar" para sempre.
      expect(readPlayerArmed(ROOM)).toBe(true);
    } finally {
      restore();
    }
  });

  it("sem storage, travar também funciona", () => {
    const restore = breakLocalStorage();
    try {
      setPlayerArmed(ROOM, true);
      setPlayerArmed(ROOM, false);

      expect(readPlayerArmed(ROOM)).toBe(false);
    } finally {
      restore();
    }
  });
});
