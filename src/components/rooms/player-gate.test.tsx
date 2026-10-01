import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayerGate, playerGateHint, playerGateTitle } from "./player-gate";
import type { PlayerState } from "@/lib/rooms/playback";

const CODE = "KARAOKE";

const ITEM = {
  id: "11111111-1111-4111-8111-111111111111",
  position: 1,
  youtube_video_id: "abc123",
  title: "Evidências",
  duration_seconds: 245,
  status: "approved",
  requested_by: "Ana",
};

function makeState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    ok: true,
    room: {
      code: CODE,
      status: "active",
      playback_status: "idle",
      queue_approval_mode: "auto",
      require_song_confirmation: false,
    },
    current: null,
    queue: [ITEM],
    pending_count: 0,
    ...overrides,
  };
}

function renderGate(phase: 1 | 2 = 1, state = makeState()) {
  const handlers = {
    onStart: vi.fn(),
    onRetry: vi.fn(),
    onUnlockAudio: vi.fn(),
  };
  render(<PlayerGate roomCode={CODE} state={state} phase={phase} {...handlers} />);
  return handlers;
}

describe("playerGateTitle", () => {
  it("fase 1 mostra o código da sala: a TV é lida de longe e precisa ser conferida", () => {
    expect(playerGateTitle(makeState(), 1)).toBe(`Sala ${CODE}`);
  });

  it("fase 2 diz o que aconteceu, em vez de repetir o código", () => {
    expect(playerGateTitle(makeState(), 2)).toBe("O navegador recusou o som");
  });
});

describe("playerGateHint", () => {
  it("fase 1 diz quantas músicas estão esperando (e o texto no singular)", () => {
    expect(playerGateHint(makeState({ queue: [ITEM] }), 1)).toContain("1 música aprovada");
    expect(playerGateHint(makeState({ queue: [ITEM, { ...ITEM, id: "2" }] }), 1)).toContain(
      "2 músicas aprovadas"
    );
  });

  it("fase 1 sem fila não promete música nenhuma", () => {
    expect(playerGateHint(makeState({ queue: [] }), 1)).toBe(
      "Toque ou pressione OK para começar."
    );
  });

  it("fase 2 oferece a saída sem som, que é a que sempre funciona", () => {
    expect(playerGateHint(makeState(), 2)).toContain("começa mudo");
  });
});

describe("PlayerGate", () => {
  it("fase 1 tem um botão só, com foco já nele", () => {
    const handlers = renderGate(1);
    const button = screen.getByRole("button", { name: /Toque ou pressione OK/ });

    // Sem foco o primeiro OK do D-pad vai para o body e a TV não responde.
    expect(document.activeElement).toBe(button);
    // Um botão só: na TV não existe "qual deles eu aperto".
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(button);

    expect(handlers.onStart).toHaveBeenCalledTimes(1);
  });

  it("fase 2 oferece tentar de novo e começar sem som", () => {
    const handlers = renderGate(2);

    expect(screen.getByTestId("player-gate")).toHaveAttribute("data-phase", "2");
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Começar sem som/ }));
    expect(handlers.onUnlockAudio).toHaveBeenCalledTimes(1);
  });
});
