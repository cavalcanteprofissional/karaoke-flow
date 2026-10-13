import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeWhileVisible } from "./visibility-channel";

/**
 * O gate de visibilidade do realtime (§8.4 item 2). O que importa provar aqui é
 * o **quando**: assina com a aba visível, desassina ao ocultar e reassina ao
 * voltar — sem duplicar nem derrubar assinatura à toa. O efeito no socket real
 * (o `disconnect()` de ~50 s do realtime-js) é do `@supabase/supabase-js` e não
 * dá para simular sem ele; o contrato que este módulo promete é o ciclo
 * subscribe/unsubscribe.
 */

let visibility: DocumentVisibilityState = "visible";

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("subscribeWhileVisible", () => {
  it("assina na hora com a aba visível e desassina no teardown", () => {
    const off = vi.fn();
    const subscribe = vi.fn(() => off);

    const unsubscribe = subscribeWhileVisible(subscribe);

    expect(subscribe).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it("não abre socket com a aba já oculta; assina ao voltar", () => {
    visibility = "hidden";
    const off = vi.fn();
    const subscribe = vi.fn(() => off);

    const unsubscribe = subscribeWhileVisible(subscribe);
    expect(subscribe).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(subscribe).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it("desassina no hidden e reassina no retorno", () => {
    const first = vi.fn();
    const second = vi.fn();
    const subscribe = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);

    const unsubscribe = subscribeWhileVisible(subscribe);
    expect(subscribe).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    expect(first).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    expect(subscribe).toHaveBeenCalledTimes(2);
    // A assinatura nova não pode ser derrubada pelo mesmo "voltar".
    expect(second).not.toHaveBeenCalled();

    unsubscribe();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("hidden repetido não desassina duas vezes (sem teardown duplicado)", () => {
    const off = vi.fn();
    subscribeWhileVisible(vi.fn(() => off));

    setVisibility("hidden");
    setVisibility("hidden");

    expect(off).toHaveBeenCalledTimes(1);
  });

  it("depois do teardown, a visibilidade não mexe mais em nada", () => {
    const off = vi.fn();
    const subscribe = vi.fn(() => off);

    subscribeWhileVisible(subscribe)();
    setVisibility("hidden");
    setVisibility("visible");

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledTimes(1);
  });

  it("sem document (SSR) assina direto, sem observar visibilidade", () => {
    vi.stubGlobal("document", undefined);
    const off = vi.fn();
    const subscribe = vi.fn(() => off);

    const unsubscribe = subscribeWhileVisible(subscribe);

    expect(subscribe).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(off).toHaveBeenCalledTimes(1);
  });
});
