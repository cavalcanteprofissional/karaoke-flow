import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PlayerKiosk } from "./player-kiosk";
import type { PlayerState } from "@/lib/rooms/playback";

/**
 * O quiosque da TV com a IFrame Player API do YouTube MOCKADA (a estratégia
 * está em TESTING.md): o `window.YT` é um player falso que guarda as options,
 * então dá para disparar `onStateChange`/`onError` como o player real faria.
 */
const mocks = vi.hoisted(() => ({
  getPlayerStateAction: vi.fn(),
  claimNextSongAction: vi.fn(),
  subscribeToPlaybackChanges: vi.fn(),
  announce: vi.fn(),
}));

vi.mock("@/lib/rooms/playback-actions", () => ({
  getPlayerStateAction: (...args: unknown[]) =>
    mocks.getPlayerStateAction(...args) as unknown,
  claimNextSongAction: (...args: unknown[]) =>
    mocks.claimNextSongAction(...args) as unknown,
}));

vi.mock("@/lib/rooms/player-channel", () => ({
  subscribeToPlaybackChanges: (...args: unknown[]) =>
    mocks.subscribeToPlaybackChanges(...args) as () => void,
  announcePlaybackChange: (...args: unknown[]) => mocks.announce(...args) as unknown,
}));

const TOKEN = "3f2a9c1e-7b4d-4c58-9e11-0a2b3c4d5e6f";
const ROOM = "KARAOKE";

const CURRENT = {
  id: "11111111-1111-4111-8111-111111111111",
  position: 1,
  youtube_video_id: "abc123",
  title: "Evidências",
  duration_seconds: 245,
  status: "playing",
  requested_by: "Ana",
  started_at: "2026-09-26T20:00:00Z",
  elapsed_seconds: 0,
};

const NEXT = {
  id: "22222222-2222-4222-8222-222222222222",
  position: 2,
  youtube_video_id: "def456",
  title: "Fala Baixinho",
  duration_seconds: 210,
  status: "approved",
  requested_by: "Bruno",
};

type FakePlayer = {
  loadVideoById: ReturnType<typeof vi.fn>;
  playVideo: ReturnType<typeof vi.fn>;
  pauseVideo: ReturnType<typeof vi.fn>;
  stopVideo: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const yt = {
  player: null as FakePlayer | null,
  options: null as {
    events?: {
      onStateChange?: (event: { data: number; target: FakePlayer }) => void;
      onError?: (event: { data: number }) => void;
      onReady?: () => void;
    };
  } | null,
};

function installFakeYouTube() {
  const methods: FakePlayer = {
    loadVideoById: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    stopVideo: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    destroy: vi.fn(),
  };
  yt.player = methods;
  yt.options = null;
  // Na API real a instância do Player É o player (com playVideo etc.); aqui a
  // classe falsa só precisa repassar os mocks e guardar as options.
  (window as unknown as { YT: unknown }).YT = {
    Player: class {
      loadVideoById = methods.loadVideoById;
      playVideo = methods.playVideo;
      pauseVideo = methods.pauseVideo;
      stopVideo = methods.stopVideo;
      getCurrentTime = methods.getCurrentTime;
      destroy = methods.destroy;

      constructor(_element: HTMLElement, options: typeof yt.options) {
        yt.options = options;
      }
    },
  };
}

function fireState(data: number) {
  act(() => {
    yt.options?.events?.onStateChange?.({ data, target: yt.player as FakePlayer });
  });
}

function fireError(data: number) {
  act(() => {
    yt.options?.events?.onError?.({ data });
  });
}

function makeState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    ok: true,
    room: {
      code: ROOM,
      status: "active",
      playback_status: "playing",
      queue_approval_mode: "auto",
      require_song_confirmation: false,
    },
    current: CURRENT,
    queue: [CURRENT, NEXT],
    pending_count: 0,
    ...overrides,
  };
}

async function renderKiosk(state = makeState()) {
  const onInvalid = vi.fn();
  const result = render(
    <PlayerKiosk
      roomCode={ROOM}
      token={TOKEN}
      initialState={state}
      onInvalid={onInvalid}
    />
  );
  // deixa o load da API resolver e o player ser criado
  await act(async () => {
    await Promise.resolve();
  });
  return { onInvalid, ...result };
}

beforeEach(() => {
  installFakeYouTube();
  mocks.getPlayerStateAction.mockResolvedValue({ ok: true, state: makeState() });
  mocks.claimNextSongAction.mockResolvedValue({
    ok: true,
    playbackStatus: "playing",
    item: null,
  });
  mocks.subscribeToPlaybackChanges.mockReturnValue(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { YT?: unknown }).YT;
});

describe("PlayerKiosk — tela da TV", () => {
  it("mostra o vídeo, o que toca e a próxima em destaque", async () => {
    await renderKiosk();

    expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();
    expect(screen.getByText(/Tocando agora — Evidências/)).toBeInTheDocument();
    expect(yt.player?.loadVideoById).toHaveBeenCalledWith("abc123", 0);
    expect(yt.player?.playVideo).toHaveBeenCalled();
    expect(screen.getByText(/Fala Baixinho/)).toBeInTheDocument();
    expect(screen.getByText("em seguida")).toBeInTheDocument();
    expect(screen.getByText(/4:05/)).toBeInTheDocument();
  });

  it("pausado segura o vídeo no lugar", async () => {
    await renderKiosk(
      makeState({
        room: {
          code: ROOM,
          status: "active",
          playback_status: "paused",
          queue_approval_mode: "auto",
          require_song_confirmation: false,
        },
      })
    );

    expect(yt.player?.pauseVideo).toHaveBeenCalled();
    expect(yt.player?.playVideo).not.toHaveBeenCalled();
    expect(mocks.claimNextSongAction).not.toHaveBeenCalled();
  });

  it("fila vazia mostra o QR do karaokê em vez de tela em branco", async () => {
    await renderKiosk(
      makeState({
        current: null,
        queue: [],
        room: {
          code: ROOM,
          status: "active",
          playback_status: "idle",
          queue_approval_mode: "manual",
          require_song_confirmation: true,
        },
      })
    );

    expect(screen.queryByTestId("youtube-stage")).toBeNull();
    expect(screen.getByText("Escaneie para adicionar uma música")).toBeInTheDocument();
    expect(screen.getByText(/A fila está vazia/)).toBeInTheDocument();
  });

  it("avança sozinho quando a música termina", async () => {
    await renderKiosk();

    fireState(0);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // O id do item que terminou viaja junto: claim repetido é no-op no banco.
    expect(mocks.claimNextSongAction).toHaveBeenCalledWith(ROOM, TOKEN, CURRENT.id);
  });

  it("no boot, sala ociosa com fila aprovada já pede a primeira", async () => {
    await renderKiosk(
      makeState({
        current: null,
        queue: [NEXT],
        room: {
          code: ROOM,
          status: "active",
          playback_status: "idle",
          queue_approval_mode: "auto",
          require_song_confirmation: false,
        },
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Boot não manda item finished: o banco só pega a fila se estiver ocioso.
    expect(mocks.claimNextSongAction).toHaveBeenCalledWith(ROOM, TOKEN, null);
  });

  it("relê o estado pelo aviso do host (realtime) e pelo poll de segurança", async () => {
    vi.useFakeTimers();
    try {
      await renderKiosk();
      expect(mocks.subscribeToPlaybackChanges).toHaveBeenCalledWith(
        ROOM,
        expect.any(Function)
      );

      const onChange = mocks.subscribeToPlaybackChanges.mock.calls[0][1] as () => void;
      onChange();
      await act(async () => {
        await Promise.resolve();
      });
      expect(mocks.getPlayerStateAction).toHaveBeenCalledWith(ROOM, TOKEN);

      const callsBefore = mocks.getPlayerStateAction.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mocks.getPlayerStateAction.mock.calls.length).toBeGreaterThan(callsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("token revogado durante a sessão leva a avisar quem abriu a tela", async () => {
    mocks.getPlayerStateAction.mockResolvedValue({
      ok: false,
      error: "Player inválido.",
      code: "PLAYER_INVALID",
    });
    const { onInvalid } = await renderKiosk();

    const onChange = mocks.subscribeToPlaybackChanges.mock.calls[0][1] as () => void;
    await act(async () => {
      onChange();
      await Promise.resolve();
    });

    expect(onInvalid).toHaveBeenCalledWith("Player inválido.");
  });

  it("autoplay bloqueado pede um toque, e o toque destrava o player", async () => {
    await renderKiosk();

    fireError(150);

    expect(
      screen.getByRole("button", { name: /Toque para começar/ })
    ).toBeInTheDocument();
    const before = yt.player?.playVideo.mock.calls.length ?? 0;

    fireEvent.click(screen.getByRole("button", { name: /Toque para começar/ }));

    expect(yt.player?.playVideo.mock.calls.length).toBe(before + 1);
    expect(screen.queryByRole("button", { name: /Toque para começar/ })).toBeNull();
  });

  it("erro de vídeo mostra aviso em vez de travar a tela", async () => {
    await renderKiosk();

    fireError(100);

    expect(screen.getByText(/Não foi possível tocar esta música/)).toBeInTheDocument();
  });

  it("não recarrega a faixa quando só muda o estado de playback", async () => {
    const { rerender } = await renderKiosk();
    const loadCalls = yt.player?.loadVideoById.mock.calls.length ?? 0;

    rerender(
      <PlayerKiosk
        roomCode={ROOM}
        token={TOKEN}
        initialState={makeState({
          current: { ...CURRENT, status: "playing" },
        })}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(yt.player?.loadVideoById.mock.calls.length).toBe(loadCalls);
  });
});
