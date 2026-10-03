import { describe, expect, it } from "vitest";

import {
  isPlayerStateFailure,
  parsePlayerState,
  parsePlayerToken,
  playerHeadline,
  playerPanel,
  playbackControls,
  shouldAutoAdvance,
  shouldClaimFromIdle,
  shouldShowPlayerGate,
} from "./playback";
import type { PlayerState } from "./playback";
import { FAKE_PLAYER_TOKEN } from "@/test/fake-player-token";

const ITEM = {
  id: "11111111-1111-4111-8111-111111111111",
  position: 1,
  youtube_video_id: "abc123",
  title: "Evidências",
  duration_seconds: 245,
  status: "playing",
  requested_by: "Ana",
};

const CURRENT = { ...ITEM, started_at: "2026-09-26T20:00:00Z", elapsed_seconds: 42 };

const NEXT_ITEM = {
  ...ITEM,
  id: "22222222-2222-4222-8222-222222222222",
  position: 2,
  status: "approved",
  title: "Fala Baixinho",
  requested_by: "Bruno",
};

function makeState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    ok: true,
    room: {
      code: "KARAOKE",
      status: "active",
      playback_status: "playing",
      queue_approval_mode: "auto",
      require_song_confirmation: false,
    },
    current: CURRENT,
    queue: [ITEM, NEXT_ITEM],
    pending_count: 0,
    ...overrides,
  };
}

describe("parsePlayerState", () => {
  it("aceita o estado completo do banco", () => {
    const result = parsePlayerState(makeState());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.current?.title).toBe("Evidências");
      expect(result.state.queue).toHaveLength(2);
    }
  });

  it("aceita estado sem música tocando (fila vazia no boot)", () => {
    const result = parsePlayerState(
      makeState({
        current: null,
        queue: [],
        room: {
          code: "KARAOKE",
          status: "active",
          playback_status: "idle",
          queue_approval_mode: "manual",
          require_song_confirmation: true,
        },
      })
    );
    expect(result.ok).toBe(true);
  });

  it("repassa o erro do banco quando o token não bate", () => {
    expect(parsePlayerState({ ok: false, error: "player inválido" })).toEqual({
      ok: false,
      error: "player inválido",
      code: "PLAYER_INVALID",
    });
  });

  it("não renderiza estado fora do contrato", () => {
    const broken = makeState();
    (broken as { pending_count: unknown }).pending_count = "muitos";
    const result = parsePlayerState(broken);
    expect(result).toEqual({
      ok: false,
      error: "Não foi possível ler o estado do player.",
      code: "PLAYER_SHAPE",
    });
  });

  it("trata null como player inválido em vez de quebrar", () => {
    expect(parsePlayerState(null).ok).toBe(false);
    expect(parsePlayerState(undefined).ok).toBe(false);
    expect(isPlayerStateFailure({ ok: false })).toBe(true);
    expect(isPlayerStateFailure({ ok: true })).toBe(false);
  });
});

describe("parsePlayerToken", () => {
  const TOKEN = FAKE_PLAYER_TOKEN;

  it("aceita a query string e array do Next", () => {
    expect(parsePlayerToken(TOKEN)).toBe(TOKEN);
    expect(parsePlayerToken([TOKEN])).toBe(TOKEN);
  });

  it("rejeita token ausente ou com formato errado", () => {
    expect(parsePlayerToken(undefined)).toBeNull();
    expect(parsePlayerToken("")).toBeNull();
    expect(parsePlayerToken("abc")).toBeNull();
  });
});

describe("playbackControls", () => {
  it("com música tocando, o host pode pausar, pular e parar", () => {
    const controls = playbackControls({
      isHost: true,
      status: "playing",
      hasCurrent: true,
      queueLength: 1,
    });
    expect(controls).toMatchObject({
      canPlay: false,
      canPause: true,
      canSkip: true,
      canStop: true,
      playLabel: "Retomar",
      emptyHint: null,
    });
  });

  it("pausado, volta a ser 'Retomar' em vez de 'Tocar'", () => {
    const controls = playbackControls({
      isHost: true,
      status: "paused",
      hasCurrent: true,
      queueLength: 1,
    });
    expect(controls.canPlay).toBe(true);
    expect(controls.canPause).toBe(false);
    expect(controls.playLabel).toBe("Retomar");
  });

  it("fila vazia não oferece 'Tocar' e avisa o host", () => {
    const controls = playbackControls({
      isHost: true,
      status: "idle",
      hasCurrent: false,
      queueLength: 0,
    });
    expect(controls.canPlay).toBe(false);
    expect(controls.canSkip).toBe(false);
    expect(controls.emptyHint).toBe("Nenhuma música aprovada na fila.");
  });

  it("participante não recebe controle nenhum", () => {
    const controls = playbackControls({
      isHost: false,
      status: "playing",
      hasCurrent: true,
      queueLength: 3,
    });
    expect(controls).toMatchObject({
      canPlay: false,
      canPause: false,
      canSkip: false,
      canStop: false,
    });
  });
});

describe("shouldAutoAdvance", () => {
  it("avança quando a faixa termina", () => {
    expect(
      shouldAutoAdvance({
        playbackStatus: "playing",
        currentVideoId: "abc123",
        endedVideoId: "abc123",
        queueLength: 2,
        armed: true,
        canAdvance: true,
      })
    ).toBe(true);
  });

  it("avança no boot quando a sala está ociosa com fila aprovada", () => {
    expect(
      shouldAutoAdvance({
        playbackStatus: "idle",
        currentVideoId: null,
        endedVideoId: null,
        queueLength: 1,
        armed: true,
        canAdvance: true,
      })
    ).toBe(true);
  });

  it("não avança nada quando a fila está vazia", () => {
    expect(
      shouldAutoAdvance({
        playbackStatus: "idle",
        currentVideoId: null,
        endedVideoId: null,
        queueLength: 0,
        armed: true,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("pausado nunca pula a música que o host está segurando", () => {
    expect(
      shouldAutoAdvance({
        playbackStatus: "paused",
        currentVideoId: "abc123",
        endedVideoId: "abc123",
        queueLength: 2,
        armed: true,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("desarmada nunca avança, mesmo com a fila cheia", () => {
    expect(
      shouldAutoAdvance({
        playbackStatus: "playing",
        currentVideoId: "abc123",
        endedVideoId: "abc123",
        queueLength: 3,
        armed: false,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("ignora o fim de um vídeo que já não é o que toca", () => {
    expect(
      shouldAutoAdvance({
        playbackStatus: "playing",
        currentVideoId: "abc123",
        endedVideoId: "outro",
        queueLength: 2,
        armed: true,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("quem só assiste não avança: a fila anda na TV", () => {
    // O `/player/<código>` sem token mostra a mesma faixa, mas dois claimeadors
    // disputariam o mesmo item sob advisory lock — e cada um tentaria terminar o
    // item do outro.
    expect(
      shouldAutoAdvance({
        playbackStatus: "playing",
        currentVideoId: "abc123",
        endedVideoId: "abc123",
        queueLength: 4,
        armed: true,
        canAdvance: false,
      })
    ).toBe(false);
  });

  it("quem só assiste também não puxa música aprovada no boot", () => {
    expect(
      shouldAutoAdvance({
        playbackStatus: "idle",
        currentVideoId: null,
        endedVideoId: null,
        queueLength: 4,
        armed: true,
        canAdvance: false,
      })
    ).toBe(false);
  });
});

describe("shouldClaimFromIdle (Fase 8a)", () => {
  it("puxa a música aprovada que apareceu com a TV já aberta", () => {
    expect(
      shouldClaimFromIdle({
        playbackStatus: "idle",
        currentItemId: null,
        queueLength: 1,
        armed: true,
        canAdvance: true,
      })
    ).toBe(true);
  });

  it("não puxa nada quando já tem música no ar", () => {
    expect(
      shouldClaimFromIdle({
        playbackStatus: "playing",
        currentItemId: "11111111-1111-4111-8111-111111111111",
        queueLength: 3,
        armed: true,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("não puxa nada com a fila vazia (a TV mostra o QR)", () => {
    expect(
      shouldClaimFromIdle({
        playbackStatus: "idle",
        currentItemId: null,
        queueLength: 0,
        armed: true,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("pausado não puxa: quem segura é o host", () => {
    expect(
      shouldClaimFromIdle({
        playbackStatus: "paused",
        currentItemId: null,
        queueLength: 2,
        armed: true,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("desarmada não puxa nada, mesmo com a fila cheia", () => {
    // Sem isso a fila anda sozinha: cada item sai de `approved` para `playing`
    // (e depois `played`) sem nunca ter passado pela tela.
    expect(
      shouldClaimFromIdle({
        playbackStatus: "idle",
        currentItemId: null,
        queueLength: 5,
        armed: false,
        canAdvance: true,
      })
    ).toBe(false);
  });

  it("quem só assiste não puxa nada da fila ociosa", () => {
    expect(
      shouldClaimFromIdle({
        playbackStatus: "idle",
        currentItemId: null,
        queueLength: 5,
        armed: true,
        canAdvance: false,
      })
    ).toBe(false);
  });
});

describe("shouldShowPlayerGate (toque de partida)", () => {
  const base = { armed: false, currentItemId: null, queueLength: 0, stalled: false };

  it("pede o toque quando há faixa tocando e a TV não foi armada", () => {
    expect(
      shouldShowPlayerGate({ ...base, currentItemId: "11111111-1111-4111-8111-111111111111" })
    ).toBe(true);
  });

  it("pede o toque quando há música aprovada esperando", () => {
    expect(shouldShowPlayerGate({ ...base, queueLength: 2 })).toBe(true);
  });

  it("não pede o toque com a fila vazia: a TV mostra o QR dos convidados", () => {
    expect(shouldShowPlayerGate(base)).toBe(false);
  });

  it("com a fila vazia e o vídeo travado, insiste (senão ficaria no primeiro frame)", () => {
    expect(shouldShowPlayerGate({ ...base, stalled: true })).toBe(true);
  });

  it("armada, não mostra o gate do toque de partida", () => {
    expect(
      shouldShowPlayerGate({
        armed: true,
        currentItemId: "11111111-1111-4111-8111-111111111111",
        queueLength: 2,
        stalled: false,
      })
    ).toBe(false);
  });

  it("armada e travada, mostra a fase 'tentar de novo' mesmo assim", () => {
    // O 150 chega com o player montado: se o gate se escondesse quando `armed`, a
    // TV ficaria num retângulo mudo sem botão nenhum.
    expect(
      shouldShowPlayerGate({
        armed: true,
        currentItemId: "11111111-1111-4111-8111-111111111111",
        queueLength: 2,
        stalled: true,
      })
    ).toBe(true);
  });
});

describe("playerPanel", () => {
  it("marca o que toca, a próxima em destaque e o resto como upcoming", () => {
    const third = {
      ...ITEM,
      id: "33333333-3333-4333-8333-333333333333",
      position: 3,
      title: "Tocando em breve",
    };
    const panel = playerPanel(makeState({ queue: [ITEM, NEXT_ITEM, third] }));
    expect(panel.rows.map((r) => [r.item.title, r.highlight])).toEqual([
      ["Evidências", "now"],
      ["Fala Baixinho", "next"],
      ["Tocando em breve", "upcoming"],
    ]);
    expect(panel.hasNext).toBe(true);
    expect(panel.empty).toBe(false);
  });

  it("respeita o limite de linhas da faixa inferior", () => {
    const panel = playerPanel(makeState({ queue: [ITEM, NEXT_ITEM] }), 2);
    expect(panel.rows).toHaveLength(2);
  });

  it("fila vazia vira estado de espera (QR code na TV)", () => {
    const panel = playerPanel(makeState({ current: null, queue: [], pending_count: 0 }));
    expect(panel.empty).toBe(true);
    expect(panel.rows).toEqual([]);
    expect(panel.hasNext).toBe(false);
  });
});

describe("playerHeadline", () => {
  it("descreve o que a TV está mostrando", () => {
    expect(playerHeadline(makeState())).toBe("Tocando agora");
    expect(
      playerHeadline(
        makeState({
          room: {
            code: "KARAOKE",
            status: "active",
            playback_status: "paused",
            queue_approval_mode: "auto",
            require_song_confirmation: false,
          },
        })
      )
    ).toBe("Pausado");
    expect(playerHeadline(makeState({ current: null }))).toBe("Nada tocando agora");
    expect(
      playerHeadline(
        makeState({
          current: null,
          room: {
            code: "KARAOKE",
            status: "closed",
            playback_status: "idle",
            queue_approval_mode: "auto",
            require_song_confirmation: false,
          },
        })
      )
    ).toBe("Sala encerrada");
  });
});
