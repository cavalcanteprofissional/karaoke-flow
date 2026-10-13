import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { roomQueueChannelName, subscribeToQueueChanges } from "./room-channel";

/**
 * O canal da fila agora sobe e desce com a visibilidade da aba (§8.4 item 2). O
 * teste prova a fiação: canal criado com a aba visível, `removeChannel` ao
 * ocultar, canal novo ao voltar — e o broadcast chegando pelo onChange depois do
 * ciclo. Onde o socket de verdade é liberado é responsabilidade do realtime-js
 * (coberto pelo teste do `visibility-channel`).
 */

const mocks = vi.hoisted(() => {
  const state = {
    channels: 0,
    removed: 0,
    broadcast: undefined as (() => void) | undefined,
  };

  function makeChannel() {
    state.channels += 1;
    const channel: Record<string, unknown> = {};
    channel.on = (_type: string, _filter: unknown, cb: () => void) => {
      state.broadcast = cb;
      return channel;
    };
    channel.subscribe = (cb?: (status: string) => void) => {
      cb?.("SUBSCRIBED");
      return channel;
    };
    return channel;
  }

  return {
    state,
    supabase: {
      channel: () => makeChannel(),
      removeChannel: () => {
        state.removed += 1;
        return Promise.resolve("ok");
      },
    },
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

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
  mocks.state.channels = 0;
  mocks.state.removed = 0;
  mocks.state.broadcast = undefined;
});

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("subscribeToQueueChanges", () => {
  it("sobe o canal da fila com a aba visível e relê no SUBSCRIBED", () => {
    const onChange = vi.fn();
    const onStatus = vi.fn();

    const off = subscribeToQueueChanges("karaoke", onChange, onStatus);

    expect(mocks.state.channels).toBe(1);
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");

    mocks.state.broadcast?.();
    expect(onChange).toHaveBeenCalledTimes(1);

    off();
    expect(mocks.state.removed).toBe(1);
  });

  it("libera o socket ao ocultar e volta a assinar no retorno", () => {
    const onChange = vi.fn();
    const off = subscribeToQueueChanges("karaoke", onChange);
    expect(mocks.state.channels).toBe(1);

    setVisibility("hidden");
    expect(mocks.state.removed).toBe(1);

    setVisibility("visible");
    expect(mocks.state.channels).toBe(2);

    mocks.state.broadcast?.();
    expect(onChange).toHaveBeenCalledTimes(1);

    off();
    expect(mocks.state.removed).toBe(2);
  });

  it("chaveia o canal pelo código normalizado", () => {
    expect(roomQueueChannelName(" karaoke ")).toBe("room-queue-KARAOKE");
  });
});
