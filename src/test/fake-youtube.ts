import { vi } from "vitest";

/**
 * Duplo da YouTube IFrame Player API com o contrato **real** (Fase 8a, correção
 * do player).
 *
 * Por que este arquivo existe: até 2026-09-27 o duplo dos testes entregava uma
 * instância com `loadVideoById`/`playVideo` prontas **no instante do
 * construtor**, e o componente também acreditava nisso (`onReady` disparado
 * logo após `new YT.Player`). Na API real a instância devolvida pelo construtor
 * é um objeto **parcial**: os métodos só existem quando o iframe posta o evento
 * `onReady` — e é o `event.target` desse evento o handle documentado. A
 * suíte ficava verde e a TV quebrava com
 * `player.loadVideoById is not a function` no primeiro approve.
 *
 * A regra que o duplo impõe, e que os testes de `youtube-stage` e
 * `player-kiosk` assumem: **método chamado antes do ready não existe**. Se um
 * teste precisar de "o player já está pronto", ele chama `ready()` — igual à
 * sequência real (script carrega → construtor → iframe posta onReady).
 */

export type FakePlayerMethods = {
  loadVideoById: ReturnType<typeof vi.fn>;
  playVideo: ReturnType<typeof vi.fn>;
  pauseVideo: ReturnType<typeof vi.fn>;
  stopVideo: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

/** O que o construtor devolve: objeto parcial, sem os métodos da API. */
export type FakePlayerInstance = Partial<FakePlayerMethods> & {
  playerId: string;
};

export type FakeYouTubeOptions = {
  videoId?: string;
  playerVars?: Record<string, unknown>;
  events?: {
    onReady?: (event: { target: FakePlayerInstance }) => void;
    onStateChange?: (event: { data: number; target: FakePlayerInstance }) => void;
    onError?: (event: { data: number }) => void;
  };
};

export type FakeYouTube = {
  /** A instância devolvida pelo construtor (a que o componente guarda). */
  instance: FakePlayerInstance;
  /** Os métodos, que só passam a existir na instância depois de `ready()`. */
  player: FakePlayerMethods;
  options: FakeYouTubeOptions | null;
  /** `true` quando a instância já tem os métodos (ou seja, depois do ready). */
  isPlayable: () => boolean;
  /** Dispara `onReady` com `target` = a instância (o iframe ficou pronto). */
  ready: () => void;
  stateChange: (data: number) => void;
  error: (data: number) => void;
};

let instances = 0;

export function installFakeYouTube(): FakeYouTube {
  const player: FakePlayerMethods = {
    loadVideoById: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    stopVideo: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    destroy: vi.fn(),
  };

  // Objeto do construtor: parcial de propósito, igual à API real.
  let instance: FakePlayerInstance = { playerId: "fake-0" };
  let options: FakeYouTubeOptions | null = null;

  // Um construtor pode devolver outro objeto (é o que a API real faz, devolvendo
  // o wrapper do player em vez de `this`).
  class FakePlayer {
    constructor(_element: HTMLElement, opts: FakeYouTubeOptions) {
      instances += 1;
      instance = { playerId: `fake-${instances}` };
      options = opts;
      return instance as unknown as FakePlayer;
    }
  }

  (window as unknown as { YT?: unknown }).YT = { Player: FakePlayer };

  return {
    get instance() {
      return instance;
    },
    player,
    get options() {
      return options;
    },
    isPlayable: () => typeof instance.loadVideoById === "function",
    ready: () => {
      // Só agora os métodos existem, e é o mesmo objeto que o evento entrega.
      Object.assign(instance, player);
      options?.events?.onReady?.({ target: instance });
    },
    stateChange: (data: number) => {
      options?.events?.onStateChange?.({ data, target: instance });
    },
    error: (data: number) => {
      options?.events?.onError?.({ data });
    },
  };
}

export function uninstallFakeYouTube(): void {
  delete (window as unknown as { YT?: unknown }).YT;
}
