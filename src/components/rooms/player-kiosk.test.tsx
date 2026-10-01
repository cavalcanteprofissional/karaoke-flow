import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { PlayerKiosk } from "./player-kiosk";
import type { PlayerState } from "@/lib/rooms/playback";

/**
 * O quiosque da TV com a IFrame Player API do YouTube MOCKADA (a estratégia
 * está em TESTING.md): o `window.YT` é um player falso, mas **fiel ao ciclo de
 * vida real** — a instância do construtor não tem métodos até o teste disparar o
 * `onReady`, como o iframe faz (ver `src/test/fake-youtube.ts`).
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

import { resetPlayerArmInMemory } from "@/lib/rooms/player-arm";
import { installFakeYouTube as installFake } from "@/test/fake-youtube";
import { FAKE_PLAYER_TOKEN } from "@/test/fake-player-token";

const TOKEN = FAKE_PLAYER_TOKEN;
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

/** A música seguinte já promovida a `current` (o que o banco devolve tocando). */
const PLAYING_NEXT = {
  ...NEXT,
  position: 1,
  status: "playing",
  started_at: "2026-09-26T20:05:00Z",
  elapsed_seconds: 0,
};

type FakeYouTubeModule = typeof import("@/test/fake-youtube");

let yt: ReturnType<FakeYouTubeModule["installFakeYouTube"]>;

function installFakeYouTube() {
  yt = installFake();
}

function fireReady() {
  act(() => {
    yt.ready();
  });
}

function fireState(data: number) {
  act(() => {
    yt.stateChange(data);
  });
}

function fireError(data: number) {
  act(() => {
    yt.error(data);
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

async function renderKiosk(
  state = makeState(),
  options: { ready?: boolean; armed?: boolean } = {}
) {
  const onInvalid = vi.fn();
  const result = render(
    <PlayerKiosk
      roomCode={ROOM}
      token={TOKEN}
      initialState={state}
      onInvalid={onInvalid}
    />
  );
  // A TV só toca depois do toque de partida: por padrão o helper clica no gate,
  // que é o estado NORMAL de uma TV em funcionamento (e é o caminho que o
  // dedo/OK percorre). `armed: false` deixa a tela parada no gate, para os
  // testes que são sobre o gate.
  if (options.armed !== false) armPlayer();
  // deixa o load da API resolver e o player ser criado
  await act(async () => {
    await Promise.resolve();
  });
  // O player só vira reproduzível quando o iframe posta o onReady. Fazer isso
  // aqui (num lugar só) é o que mantém a suíte inteira com o ciclo de vida real:
  // o quiosque só pode aplicar o estado do banco DEPOIS disso.
  if (options.ready !== false) fireReady();
  return { onInvalid, ...result };
}

/** O toque do dono da TV no botão do gate. */
function armPlayer() {
  const button = screen
    .queryAllByRole("button", { name: /Toque ou pressione OK/ })[0] as
    | HTMLElement
    | undefined;
  if (!button) return;
  act(() => {
    fireEvent.click(button);
  });
}

/**
 * Deixa a IFrame API resolver e o construtor do player rodar. O `new YT.Player`
 * acontece num `.then()`, então sem este flush o `ready()` do teste não
 * encontraria o player que ainda nem existe.
 */
async function flushYouTubeMount() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Simula o host (ou o poll de 5s) trazendo um estado novo do banco. */
async function bringState(state: PlayerState) {
  mocks.getPlayerStateAction.mockResolvedValue({ ok: true, state });
  const onChange = mocks.subscribeToPlaybackChanges.mock.calls[0][1] as () => void;
  await act(async () => {
    onChange();
    await Promise.resolve();
  });
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
  // O "armado" é persistido por sala e tem memória de sessão: sem limpar os
  // dois, o próximo teste abriria a TV já armada e o gate nem apareceria.
  window.localStorage.clear();
  resetPlayerArmInMemory();
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
    vi.useFakeTimers();
    try {
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

      // `load` sempre chega tocando (playerVars.autoplay), então o quiosque
      // pausa logo em seguida: o que importa é o estado final.
      expect(yt.player.pauseVideo).toHaveBeenCalled();
      // E nenhum pedido de toque pode aparecer para um vídeo pausado.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.queryByRole("button", { name: /Toque para começar/ })).toBeNull();
      expect(mocks.claimNextSongAction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

  it("música aprovada depois de a TV abrir espera o toque de partida", async () => {
    // Regressão do teste manual: a TV abria ociosa, o host aprovava uma música e
    // nada acontecia — o claim só existia no mount e no onEnded. A diferença
    // agora: a TV também não pode POUXAR sozinha, porque ninguém olhou para ela.
    const idle = makeState({
      current: null,
      queue: [],
      room: {
        code: ROOM,
        status: "active",
        playback_status: "idle",
        queue_approval_mode: "manual",
        require_song_confirmation: true,
      },
    });
    mocks.getPlayerStateAction.mockResolvedValue({ ok: true, state: idle });
    await renderKiosk(idle, { armed: false });
    expect(mocks.claimNextSongAction).not.toHaveBeenCalled();
    // Fila vazia e ninguém tocando: não é hora de pedir toque, é a tela do QR.
    expect(screen.getByText("Escaneie para adicionar uma música")).toBeInTheDocument();

    // O poll (ou o broadcast do host) traz a fila aprovada.
    mocks.getPlayerStateAction.mockResolvedValue({
      ok: true,
      state: makeState({
        current: null,
        queue: [NEXT],
        room: { ...idle.room, playback_status: "idle" },
      }),
    });
    const onChange = mocks.subscribeToPlaybackChanges.mock.calls[0][1] as () => void;
    await act(async () => {
      onChange();
      await Promise.resolve();
    });

    // O gate assume, e a fila continua parada até o toque.
    expect(screen.getByTestId("player-gate")).toBeInTheDocument();
    expect(mocks.claimNextSongAction).not.toHaveBeenCalled();

    armPlayer();

    expect(mocks.claimNextSongAction).toHaveBeenCalledWith(ROOM, TOKEN, null);
  });

  it("não perde a primeira música do boot enquanto o player não fica pronto", async () => {
    // Regressão do crash de 2026-09-27: a TV abria, o quiosque mandava load()
    // antes de o iframe ficar pronto e a tela morria com
    // `player.loadVideoById is not a function`.
    await renderKiosk(makeState(), { ready: false });

    expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();
    expect(yt.player.loadVideoById).not.toHaveBeenCalled();

    fireReady();

    expect(yt.player.loadVideoById).toHaveBeenCalledWith("abc123", 0);
    expect(yt.player.playVideo).toHaveBeenCalled();
  });

  it("avanço do host com o player ainda subindo toca a música nova, não a velha", async () => {
    await renderKiosk(makeState(), { ready: false });

    // O host pula: o estado chega antes de o player ficar pronto.
    await bringState(makeState({ current: PLAYING_NEXT, queue: [PLAYING_NEXT] }));
    expect(yt.player.loadVideoById).not.toHaveBeenCalled();
    expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();

    fireReady();

    // Só a última intenção: a música antiga nunca chega a carregar.
    expect(yt.player.loadVideoById).toHaveBeenCalledTimes(1);
    expect(yt.player.loadVideoById).toHaveBeenCalledWith("def456", 0);
  });

  it("fila esgota e volta a tocar: o player novo não é confundido com o antigo", async () => {
    await renderKiosk(makeState());
    expect(yt.player.loadVideoById).toHaveBeenCalledWith("abc123", 0);

    // Fim da última música: o stage desmonta e o quiosque esquece a readiness.
    await bringState(
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

    // Aprovações que chegam durante o intervalo já formam a fila.
    await bringState(makeState({ current: PLAYING_NEXT, queue: [PLAYING_NEXT] }));
    expect(yt.player.loadVideoById).toHaveBeenCalledTimes(1);

    fireReady();

    expect(yt.player.loadVideoById).toHaveBeenLastCalledWith("def456", 0);
  });

  it("boot lento avisa a sala em vez de deixar a TV preta", async () => {
    vi.useFakeTimers();
    try {
      await renderKiosk(makeState(), { ready: false });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      expect(screen.getByText(/Não foi possível tocar esta música/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("o aviso de boot lento some se o player ficar pronto depois", async () => {
    vi.useFakeTimers();
    try {
      await renderKiosk(makeState(), { ready: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(screen.getByText(/Não foi possível tocar esta música/)).toBeInTheDocument();

      fireReady();

      expect(screen.queryByText(/Não foi possível tocar esta música/)).toBeNull();
      expect(yt.player.loadVideoById).toHaveBeenCalledWith("abc123", 0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("não pede música com a sala pausada nem com fila vazia", async () => {
    await renderKiosk(
      makeState({
        current: null,
        queue: [NEXT],
        room: {
          code: ROOM,
          status: "active",
          playback_status: "paused",
          queue_approval_mode: "manual",
          require_song_confirmation: true,
        },
      })
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.claimNextSongAction).not.toHaveBeenCalled();
  });

  it("abre por sessão quando não há token (participante aprovado)", async () => {
    const onInvalid = vi.fn();
    render(
      <PlayerKiosk
        roomCode={ROOM}
        token={null}
        initialState={makeState({
          current: null,
          queue: [NEXT],
          room: {
            code: ROOM,
            status: "active",
            playback_status: "idle",
            queue_approval_mode: "manual",
            require_song_confirmation: true,
          },
        })}
        onInvalid={onInvalid}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    // O gate vale para todo mundo, participante incluído: o celular também
    // bloqueia áudio sem gesto, e um código só é mais simples que dois.
    expect(mocks.claimNextSongAction).not.toHaveBeenCalled();
    armPlayer();

    // Sem token: a action manda `null` e o banco decide pela sessão (migration
    // 20260927000029). O token da TV não aparece em nenhum lugar.
    expect(mocks.claimNextSongAction).toHaveBeenCalledWith(ROOM, null, null);
    expect(onInvalid).not.toHaveBeenCalled();
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

  it("autoplay recusado vira a tela de 'tentar de novo', e o toque refaz o play", async () => {
    await renderKiosk();

    fireError(150);

    // Não é mais o CTA por cima do vídeo: é o gate inteiro, e o vídeo continua
    // montado atrás dele.
    const gate = screen.getByTestId("player-gate");
    expect(gate).toHaveAttribute("data-phase", "2");
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeInTheDocument();
    expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();
    const before = yt.player?.playVideo.mock.calls.length ?? 0;

    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));

    expect(yt.player?.playVideo.mock.calls.length).toBe(before + 1);
    expect(screen.queryByTestId("player-gate")).toBeNull();
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

/**
 * Os dois defeitos que o teste manual na TV mostrou depois da primeira correção
 * (2026-09-27). Mesmo `PlayerKiosk`, mesmo `YouTubeStage`, dois sintomas:
 */
describe("PlayerKiosk — 'Parar' do host e o CTA de gesto", () => {
  function idleState(): PlayerState {
    return makeState({
      current: null,
      queue: [],
      room: {
        code: ROOM,
        status: "active",
        playback_status: "idle",
        queue_approval_mode: "manual",
        require_song_confirmation: true,
      },
    });
  }

  it("o host parando no meio da faixa desmonta o player sem derrubar a TV", async () => {
    // `set_playback('stop')` deixa a sala `idle` sem item atual (migration
    // 20260926000027), o quiosque relê e o `<YouTubeStage>` sai do DOM. Com o
    // `destroy()` no cleanup passivo, a IFrame API removia um iframe já órfão e
    // a TV caía na tela de erro — o mesmo crash da fila vazia, outro gatilho.
    await renderKiosk();
    expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();

    let stageInDomAtDestroy = false;
    yt.player.destroy.mockImplementation(() => {
      stageInDomAtDestroy = Boolean(
        document.querySelector('[data-testid="youtube-stage"]')
      );
      throw new DOMException(
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
        "NotFoundError"
      );
    });

    await expect(bringState(idleState())).resolves.toBeUndefined();

    expect(stageInDomAtDestroy).toBe(true);
    expect(yt.player.destroy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("youtube-stage")).toBeNull();
    expect(screen.getByText("Escaneie para adicionar uma música")).toBeInTheDocument();
  });

  it("a música tocada some com o 'Parar' e não volta a tocar sozinha", async () => {
    // O item que estava tocando vira `skipped` no banco; a TV não deve recarregá-lo.
    await renderKiosk();
    await bringState(idleState());

    expect(yt.player.loadVideoById).toHaveBeenCalledTimes(1);
    expect(yt.player.stopVideo).not.toHaveBeenCalled();
  });

  it("a tela de 'tentar de novo' some quando o vídeo entra em PLAYING", async () => {
    await renderKiosk();
    fireError(150);
    expect(screen.getByTestId("player-gate")).toHaveAttribute("data-phase", "2");

    fireState(1);

    expect(screen.queryByTestId("player-gate")).toBeNull();
  });

  it("as relêções do poll de 5s não trazem o gate de volta", async () => {
    // Regressão do spam na TV: o quiosque chama play() a cada poll (o objeto
    // `current` volta NOVO do banco a cada leitura) e o pedido de toque
    // reaparecia sem parar por cima do vídeo que já estava tocando.
    vi.useFakeTimers();
    try {
      // Estado novo a cada leitura, como o banco devolve de verdade: é a
      // identidade nova de `current` que reexecuta o efeito de aplicação.
      const freshState = (): PlayerState =>
        makeState({ current: { ...CURRENT }, queue: [{ ...CURRENT }, { ...NEXT }] });
      mocks.getPlayerStateAction.mockImplementation(async () => ({
        ok: true,
        state: freshState(),
      }));
      await renderKiosk();
      fireState(1);
      expect(screen.queryByTestId("player-gate")).toBeNull();

      const playCalls = yt.player.playVideo.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      // O player recebeu play() de novo (o poll relê o estado)...
      expect(yt.player.playVideo.mock.calls.length).toBeGreaterThan(playCalls);
      // ...e mesmo assim nenhum pedido de toque apareceu.
      expect(screen.queryByTestId("player-gate")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * O toque de partida (Fase 8). O quiosque inteiro gira em torno de duas
 * garantias: **desarmada não toca** e **armada não pede o toque de novo**.
 */
describe("PlayerKiosk — toque de partida", () => {
  it("não monta o player nem pede música antes do toque", async () => {
    await renderKiosk(makeState(), { armed: false });

    // O player do YouTube não existe: a TV desarmada não baixa vídeo nenhum.
    expect(screen.queryByTestId("youtube-stage")).toBeNull();
    expect(screen.getByTestId("player-gate")).toHaveAttribute("data-phase", "1");
    expect(yt.player.loadVideoById).not.toHaveBeenCalled();
    expect(yt.player.playVideo).not.toHaveBeenCalled();
    // A faixa está tocando no banco e mesmo assim ninguém pediu nada: sem
    // claim, o item não sai de `playing` às cegas.
    expect(mocks.claimNextSongAction).not.toHaveBeenCalled();
  });

  it("o toque arma a TV, monta o player e já manda a faixa tocando", async () => {
    await renderKiosk(makeState(), { ready: false, armed: false });
    expect(screen.queryByTestId("youtube-stage")).toBeNull();

    armPlayer();
    await flushYouTubeMount();

    expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();
    expect(screen.queryByTestId("player-gate")).toBeNull();

    // O player nasce DENTRO do gesto (por isso `autoplay: 0`): o primeiro play
    // é o que o browser aceita.
    fireReady();
    expect(yt.player.loadVideoById).toHaveBeenCalledWith("abc123", 0);
    expect(yt.player.playVideo).toHaveBeenCalled();
  });

  it("o botão do gate já nasce com o foco (é o D-pad que vai apertar)", async () => {
    await renderKiosk(makeState(), { armed: false });

    // Sem foco, o primeiro OK do controle iria para o body e a TV "não
    // responderia". `Enter` num `<button>` focado dispara o onClick.
    const button = screen.getByRole("button", { name: /Toque ou pressione OK/ });
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    expect(screen.queryByTestId("player-gate")).toBeNull();
  });

  it("com a fila vazia, o gate não aparece: a TV mostra o QR dos convidados", async () => {
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
      }),
      { armed: false }
    );

    expect(screen.queryByTestId("player-gate")).toBeNull();
    expect(screen.getByText("Escaneie para adicionar uma música")).toBeInTheDocument();
  });

  it("'trancar TV' devolve o gate e a mesma faixa volta a tocar no toque seguinte", async () => {
    await renderKiosk();
    expect(yt.player.loadVideoById).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Trancar TV/ }));

    expect(screen.getByTestId("player-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("youtube-stage")).toBeNull();

    // O player que guardava a faixa foi destruído: se o quiosque lembrasse,
    // rearmar pareceria "faixa já carregada" e a TV ficaria muda com o toque
    // certo na tela.
    armPlayer();
    await flushYouTubeMount();
    fireReady();

    expect(yt.player.loadVideoById).toHaveBeenCalledTimes(2);
    expect(yt.player.loadVideoById).toHaveBeenLastCalledWith("abc123", 0);
  });

  it("'começar sem som' dá conta de uma TV que recusou o áudio", async () => {
    await renderKiosk();
    fireError(150);
    expect(screen.getByTestId("player-gate")).toHaveAttribute("data-phase", "2");

    fireEvent.click(screen.getByRole("button", { name: /Começar sem som/ }));

    // O mute é pedido no load da faixa, senão o gesto já passou e o play
    // sairia com som.
    expect(yt.player.muteVideo).toHaveBeenCalled();
    expect(screen.queryByTestId("player-gate")).toBeNull();

    // E o som volta por um gesto novo, que é o que o browser aceita.
    fireEvent.click(screen.getByRole("button", { name: /Ativar o som/ }));
    expect(yt.player.unmuteVideo).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Ativar o som/ })).toBeNull();
  });

  it("o botão de som some sozinho depois de um tempo", async () => {
    vi.useFakeTimers();
    try {
      await renderKiosk();
      fireError(150);
      fireEvent.click(screen.getByRole("button", { name: /Começar sem som/ }));
      expect(screen.getByRole("button", { name: /Ativar o som/ })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      // Uma TV a noite inteira não pode ficar com o botão piscando sozinha.
      expect(screen.queryByRole("button", { name: /Ativar o som/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a TV armada não pede o toque de novo ao recarregar", async () => {
    const { unmount } = await renderKiosk();
    expect(window.localStorage.getItem(`kf:player-armed:${ROOM}`)).toBe("1");
    unmount();

    // Reload da TV no meio da festa: o dono já autorizou, o gate não volta.
    await renderKiosk(makeState(), { armed: false });

    expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Toque ou pressione OK/ })).toBeNull();
  });

  it("a marcação do 'trancar' some do storage: a próxima abertura pede o toque", async () => {
    await renderKiosk();
    fireEvent.click(screen.getByRole("button", { name: /Trancar TV/ }));

    expect(window.localStorage.getItem(`kf:player-armed:${ROOM}`)).toBeNull();
  });

  it("'trancar TV' funciona **depois** de a faixa tocar", async () => {
    // Regressão da primeira versão do gate: o estado `audioUnlocked` congelava a
    // escrita no storage quando o áudio já tinha sido destravado, e o "trancar"
    // ficava sem efeito nenhum — o botão aparecia e não fazia nada.
    await renderKiosk();
    fireState(1);

    fireEvent.click(screen.getByRole("button", { name: /Trancar TV/ }));

    expect(screen.getByTestId("player-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("youtube-stage")).toBeNull();
    expect(window.localStorage.getItem(`kf:player-armed:${ROOM}`)).toBeNull();
  });

  it("o HTML do servidor é o gate mesmo com a TV já armada no storage", () => {
    // O bug que a primeira versão do gate tinha: ler o `localStorage` no estado
    // inicial fazia o SERVIDOR mandar o gate e o CLIENTE mandar o vídeo — duas
    // árvores diferentes para a mesma tela, hydration mismatch, e a TV pagando a
    // regeneração. Este teste é o que o jsdom sozinho não provava.
    window.localStorage.setItem(`kf:player-armed:${ROOM}`, "1");

    const html = renderToString(
      <PlayerKiosk roomCode={ROOM} token={TOKEN} initialState={makeState()} />
    );

    expect(html).toContain('data-testid="player-gate"');
    expect(html).not.toContain('data-testid="youtube-stage"');
  });

  it("TV sem storage funciona igual (a cota estourada não pode derrubar a tela)", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("storage cheio", "QuotaExceededError");
      },
    });
    try {
      await renderKiosk();

      expect(screen.getByTestId("youtube-stage")).toBeInTheDocument();
      expect(yt.player.playVideo).toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
