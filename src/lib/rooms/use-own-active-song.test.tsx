import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import { useOwnActiveSong, type UseOwnActiveSongInput } from "./use-own-active-song";

/**
 * A leitura ao vivo da música ativa (Fase 8g) — a causa raiz do "demora para
 * pedir a próxima música".
 *
 * O que este arquivo prova é o **quando**, não o quê: o *quê* é
 * `ownActiveSongView`, a mesma função do servidor (`readOwnActiveSong`), e quem
 * garante que as duas não divergirem é o teste da regra pura. Aqui o foco é a
 * lista de gatilhos que fazem a tela reler sem ninguém pedir reload — e, mais
 * importante, o que acontece quando um deles falha.
 */

type Song = { id: string; title: string; status: string; position: number };

const ROOM_ID = "room-1";
const ROOM_CODE = "KARAOKE";
const USER_ID = "user-1";

const mocks = vi.hoisted(() => {
  const state: {
    songs: { id: string; title: string; status: string; position: number }[];
    /** Resposta da próxima leitura; `null` simula falha de banco. */
    read: { data: unknown[] | null; error: unknown };
    postgresHandler?: () => void;
    broadcastHandler?: () => void;
    subscribeCalls: number;
    removeChannel: (...args: unknown[]) => unknown;
  } = {
    songs: [],
    read: { data: [], error: null },
    subscribeCalls: 0,
    removeChannel: vi.fn(),
  };

  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    in: () => query,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(state.read).then(resolve),
  };

  const channel = {
    on: vi.fn((...args: unknown[]) => {
      // `["postgres_changes", filtro, handler]`
      if (args[0] === "postgres_changes") state.postgresHandler = args[2] as () => void;
      return channel;
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      state.subscribeCalls += 1;
      // A API real chama o callback de status ao assinar — é assim que a fila faz
      // a primeira leitura, e é por isso que o botão já abre certo na chegada.
      callback?.("SUBSCRIBED");
      return channel;
    }),
  };

  const supabase = {
    from: () => query,
    channel: () => channel,
    removeChannel: (...args: unknown[]) => state.removeChannel(...args),
  };

  return {
    state,
    supabase,
    subscribeToQueueChanges: vi.fn(),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mocks.supabase,
}));

vi.mock("@/lib/rooms/room-channel", () => ({
  subscribeToQueueChanges: (
    roomCode: string,
    onChange: () => void,
    onStatus?: (status: string) => void
  ) => {
    mocks.state.broadcastHandler = onChange;
    onStatus?.("SUBSCRIBED");
    return () => undefined;
  },
}));

function Harness(props: Partial<UseOwnActiveSongInput>) {
  const view = useOwnActiveSong({
    roomId: ROOM_ID,
    roomCode: ROOM_CODE,
    userId: USER_ID,
    isHost: false,
    ...props,
  });
  return <div data-testid="view">{JSON.stringify(view ?? null)}</div>;
}

function renderView(props: Partial<UseOwnActiveSongInput> = {}) {
  const utils = render(<Harness {...props} />);
  return {
    ...utils,
    view: () => JSON.parse(utils.getByTestId("view").textContent ?? "null") as unknown,
  };
}

const tocando: Song = { id: "item-1", title: "Evidências", status: "playing", position: 1 };

beforeEach(() => {
  mocks.state.read = { data: [tocando], error: null };
  mocks.state.postgresHandler = undefined;
  mocks.state.broadcastHandler = undefined;
  mocks.state.subscribeCalls = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useOwnActiveSong — leitura ao vivo da música ativa", () => {
  it("começa pelo valor do servidor, para a tela não piscar antes de hidratar", () => {
    const { view } = renderView({
      initial: { playing: true, title: "Evidências" },
    });

    expect(view()).toEqual({ playing: true, title: "Evidências" });
  });

  it("destrava quando o postgres_changes traz a música como `played`", async () => {
    const { view } = renderView({ initial: { playing: true, title: "Evidências" } });
    expect(view()).toEqual({ playing: true, title: "Evidências" });

    // A faixa acabou na TV: a trigger/assert mudou o status no banco e o evento
    // chega antes de qualquer navegação.
    mocks.state.read = { data: [], error: null };
    await act(async () => {
      mocks.state.postgresHandler?.();
      await Promise.resolve();
    });

    expect(view()).toEqual({ playing: false, title: null });
  });

  it("o broadcast de quem mutou a fila também relê", async () => {
    renderView({ initial: { playing: true, title: "Evidências" } });

    mocks.state.read = { data: [], error: null };
    await act(async () => {
      mocks.state.broadcastHandler?.();
      await Promise.resolve();
    });

    expect(mocks.state.read.data).toEqual([]);
  });

  it("o poll de 10s é a rede de segurança quando nada avisa", async () => {
    vi.useFakeTimers();
    renderView({ initial: { playing: true, title: "Evidências" } });
    mocks.state.read = { data: [], error: null };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(mocks.state.read.data).toEqual([]);
  });

  it("relê quando a tela volta a ficar visível (o caso do celular travado)", async () => {
    const { view } = renderView({ initial: { playing: true, title: "Evidências" } });
    mocks.state.read = { data: [], error: null };

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(view()).toEqual({ playing: false, title: null });
  });

it("a música que está na fila (não tocando) continua sendo avisada, com o nome", async () => {
    const naFila: Song = { id: "item-2", title: "Já pedi essa", status: "approved", position: 3 };
    mocks.state.read = { data: [naFila], error: null };

    const { view } = renderView();
    await act(async () => {
      await Promise.resolve();
    });

    // Dá para pedir (o aviso de substituição aparece), mas com o título certo.
    expect(view()).toEqual({ playing: false, title: "Já pedi essa" });
  });

  it("leitura falha não trava nem destrava: a tela fica com o valor que tinha", async () => {
    const { view } = renderView({ initial: { playing: true, title: "Evidências" } });

    mocks.state.read = { data: null, error: { message: "boom" } };
    await act(async () => {
      mocks.state.postgresHandler?.();
      await Promise.resolve();
    });

    // Quem decide é a trigger `queue_items_one_active_per_participant`: a tela
    // não pode destravar sozinha por causa de uma leitura que falhou.
    expect(view()).toEqual({ playing: true, title: "Evidências" });
  });

  it("o host não assina nada — o limite é por participante, e ele não tem", async () => {
    const { view } = renderView({ isHost: true, initial: { playing: true, title: "X" } });

    expect(view()).toEqual({ playing: false, title: null });
    expect(mocks.state.subscribeCalls).toBe(0);
  });

  it("desassina tudo ao desmontar", () => {
    const { unmount } = renderView();

    unmount();

    expect(mocks.state.removeChannel).toHaveBeenCalled();
  });
});