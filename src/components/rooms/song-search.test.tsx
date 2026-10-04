import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SongSearch } from "./song-search";
import type { YouTubeVideo } from "@/lib/youtube/types";

const VIDEO: YouTubeVideo = {
  videoId: "abc123",
  title: "Evidências",
  thumbnailUrl: "https://img.youtube.com/vi/abc123/hqdefault.jpg",
  channelTitle: "Chitãozinho",
  durationSeconds: 245,
};

const mocks = vi.hoisted(() => ({
  addSongToQueueAction: vi.fn(),
  replaceQueueSongAction: vi.fn(),
  announceQueueChange: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mocks.push(...args) }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toast.success(...args),
    error: (...args: unknown[]) => mocks.toast.error(...args),
  },
}));

vi.mock("@/lib/rooms/queue-actions", () => ({
  addSongToQueueAction: (...args: unknown[]) =>
    mocks.addSongToQueueAction(...args) as unknown,
  replaceQueueSongAction: (...args: unknown[]) =>
    mocks.replaceQueueSongAction(...args) as unknown,
}));

vi.mock("@/lib/consent/geo", () => ({
  captureGeolocation: vi.fn(),
  writeGeoCookie: vi.fn(),
}));

// Pedir/trocar música tem que aparecer na lista dos outros aparelhos da sala
// na hora (2026-09-27) — daí o aviso por broadcast.
vi.mock("@/lib/rooms/room-channel", () => ({
  announceQueueChange: (...args: unknown[]) => mocks.announceQueueChange(...args) as unknown,
}));

function renderSearch(props: Partial<React.ComponentProps<typeof SongSearch>> = {}) {
  return render(
    <SongSearch
      roomCode="KARAOKE"
      presenceOk
      presenceMessage={null}
      requireSongConfirmation={false}
      {...props}
    />
  );
}

/** Busca na API (debounce de 500 ms) e devolve o botão da primeira música. */
async function searchAndGetReplaceButton(query = "evidencias") {
  fireEvent.change(screen.getByLabelText("Buscar música no YouTube"), {
    target: { value: query },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  return screen.getByRole("button", { name: `Trocar por ${VIDEO.title}` });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.replaceQueueSongAction.mockResolvedValue({ ok: true });
  mocks.addSongToQueueAction.mockResolvedValue({ ok: true, item: { status: "pending" } });
  mocks.announceQueueChange.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: [VIDEO] }),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SongSearch — modo troca (Bloco D)", () => {
  it("avisa qual música está sendo trocada e oferece voltar para a fila", () => {
    renderSearch({
      replaceItemId: "item-1",
      replaceItemTitle: "Evidências (toca agora)",
    });

    expect(screen.getByText("Evidências (toca agora)")).toBeInTheDocument();
    expect(screen.getByText(/posição e a aprovação são mantidas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para a fila/ })).toHaveAttribute(
      "href",
      "/salas/KARAOKE"
    );
    expect(
      screen.getByPlaceholderText("Buscar a música que vai substituir…")
    ).toBeInTheDocument();
  });

  it("exige confirmação mesmo com require_song_confirmation desligado e troca o item certo", async () => {
    renderSearch({
      replaceItemId: "item-1",
      replaceItemTitle: "Evidências (toca agora)",
    });

    const button = await searchAndGetReplaceButton();
    fireEvent.click(button);

    expect(
      screen.getByRole("heading", { name: /Trocar a música da fila\?/ })
    ).toBeInTheDocument();
    expect(mocks.replaceQueueSongAction).not.toHaveBeenCalled();
    expect(mocks.addSongToQueueAction).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    });

    expect(mocks.replaceQueueSongAction).toHaveBeenCalledWith("item-1", VIDEO);
    expect(mocks.addSongToQueueAction).not.toHaveBeenCalled();
  });

  it("sucesso da troca confirma que posição e status foram mantidos", async () => {
    renderSearch({ replaceItemId: "item-1" });

    fireEvent.click(await searchAndGetReplaceButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    });

    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Evidências — música trocada, posição e status mantidos."
    );
  });

  it("falha da troca mostra o erro da action e não enfileira nada", async () => {
    mocks.replaceQueueSongAction.mockResolvedValue({
      ok: false,
      error: "Esta música já saiu da fila.",
    });
    renderSearch({ replaceItemId: "item-1" });

    fireEvent.click(await searchAndGetReplaceButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    });

    expect(mocks.toast.error).toHaveBeenCalledWith("Esta música já saiu da fila.");
    expect(mocks.addSongToQueueAction).not.toHaveBeenCalled();
  });

  it("no modo troca o resultado não vira badge 'na fila' (o item segue substituível)", async () => {
    renderSearch({ replaceItemId: "item-1" });

    fireEvent.click(await searchAndGetReplaceButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    fireEvent.change(screen.getByLabelText("Buscar música no YouTube"), {
      target: { value: "outra" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.queryByText("na fila")).toBeNull();
    expect(
      screen.getByRole("button", { name: `Trocar por ${VIDEO.title}` })
    ).toBeInTheDocument();
  });

  it("sem replaceItemId continua no fluxo de adicionar à fila", async () => {
    renderSearch();

    fireEvent.change(screen.getByLabelText("Buscar música no YouTube"), {
      target: { value: "evidencias" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(
      screen.getByRole("button", { name: `Adicionar ${VIDEO.title} à fila` })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.addSongToQueueAction).toHaveBeenCalledWith({
      roomCode: "KARAOKE",
      video: VIDEO,
    });
    expect(mocks.replaceQueueSongAction).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Buscar música no YouTube…")).toBeInTheDocument();
  });

  it("devolve o participante para a tela da sala depois de pedir a música", async () => {
    renderSearch();

    fireEvent.change(screen.getByLabelText("Buscar música no YouTube"), {
      target: { value: "evidencias" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(
      screen.getByRole("button", { name: `Adicionar ${VIDEO.title} à fila` })
    );
    await act(async () => {
      await Promise.resolve();
    });

    // Pedir música não é assistir: volta para a mesa, onde o player é escolha.
    expect(mocks.push).toHaveBeenCalledWith("/salas/KARAOKE");
    // E a sala é avisada: era o aviso que não existia, e a lista alheia não
    // atualizava quando alguém pedia/trocava uma música.
    expect(mocks.announceQueueChange).toHaveBeenCalledWith("KARAOKE");
  });

  it("não sai da busca quando a música não entrou na fila", async () => {
    mocks.addSongToQueueAction.mockResolvedValue({
      ok: false,
      error: "Você já tem 3 pedidos aguardando.",
    });
    renderSearch();

    fireEvent.change(screen.getByLabelText("Buscar música no YouTube"), {
      target: { value: "evidencias" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(
      screen.getByRole("button", { name: `Adicionar ${VIDEO.title} à fila` })
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("na troca de música continua na tela de busca (não é hora de watch party)", async () => {
    renderSearch({ replaceItemId: "item-1", replaceItemTitle: "Evidências" });

    fireEvent.click(await searchAndGetReplaceButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    });

    expect(mocks.replaceQueueSongAction).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    // A troca muda o título/duração que a sala inteira vê: avisa também.
    expect(mocks.announceQueueChange).toHaveBeenCalledWith("KARAOKE");
  });
});

/**
 * A regra de "uma música ativa por participante" (migration `20261004000042`)
 * tem duas metades: o banco decide, e a tela **avisa**. Este bloco cobre a
 * segunda. O que NÃO está aqui, e por quê: a decisão final — a action e a
 * trigger recusam de qualquer jeito (`queue-actions.test.ts` e a série Q do smoke
 * cobrem isso), então um teste de tela "provando a regra" provaria a coisa errada.
 */
describe("SongSearch — uma música ativa por participante", () => {
  /** Busca na API (debounce de 500 ms) e devolve o botão de adicionar. */
  async function searchAndGetAddButton() {
    fireEvent.change(screen.getByLabelText("Buscar música no YouTube"), {
      target: { value: "evidencias" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    return screen.getByRole("button", { name: `Adicionar ${VIDEO.title} à fila` });
  }

  it("avisa ANTES que o próximo pedido substitui a música que está na fila", async () => {
    renderSearch({ ownActiveSong: { playing: false, replacedTitle: "Já pedi essa" } });

    const aviso = screen.getByTestId("aviso-substituicao");
    expect(aviso).toHaveTextContent("Já pedi essa");
    expect(aviso).toHaveTextContent("substitui esse pedido");
    // O aviso informa, não impede: ainda dá para pedir.
    expect(await searchAndGetAddButton()).toBeEnabled();
  });

  it("depois do pedido, o toast nomeia a música que saiu da fila", async () => {
    mocks.addSongToQueueAction.mockResolvedValue({
      ok: true,
      item: { status: "pending" },
      replaced: { id: "item-1", title: "Já pedi essa" },
    });
    renderSearch({ ownActiveSong: { playing: false, replacedTitle: "Já pedi essa" } });

    fireEvent.click(await searchAndGetAddButton());
    await act(async () => {
      await Promise.resolve();
    });

    const texto = mocks.toast.success.mock.calls[0][0] as string;
    expect(texto).toContain(VIDEO.title);
    expect(texto).toContain("Já pedi essa");
    expect(texto).toContain("saiu da fila");
  });

  it("com a música tocando, trava o botão e explica que é para esperar", async () => {
    renderSearch({ ownActiveSong: { playing: true, replacedTitle: "Tocando pra mim" } });

    const aviso = screen.getByTestId("aviso-tocando");
    expect(aviso).toHaveTextContent("Tocando pra mim");
    expect(aviso).toHaveTextContent("quando ela terminar");
    expect(await searchAndGetAddButton()).toBeDisabled();
    // Nada de aviso de substituição: só uma regra por vez.
    expect(screen.queryByTestId("aviso-substituicao")).toBeNull();
  });

  it("sem música ativa, nenhum aviso aparece — o caso comum não muda", async () => {
    renderSearch({ ownActiveSong: { playing: false, replacedTitle: null } });

    expect(screen.queryByTestId("aviso-substituicao")).toBeNull();
    expect(screen.queryByTestId("aviso-tocando")).toBeNull();

    fireEvent.click(await searchAndGetAddButton());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.addSongToQueueAction).toHaveBeenCalled();
    expect(mocks.toast.success.mock.calls[0][0] as string).not.toContain("saiu da fila");
  });

  it("a troca autorizada ignora a trava — ali o limite é outro", async () => {
    renderSearch({
      replaceItemId: "item-1",
      replaceItemTitle: "Tocando pra mim",
      ownActiveSong: { playing: true, replacedTitle: "Tocando pra mim" },
    });

    // Sem botão de adicionar e sem o aviso de "toca agora": a trava é do pedido.
    expect(screen.queryByRole("button", { name: /Adicionar/ })).toBeNull();
    expect(screen.queryByTestId("aviso-tocando")).toBeNull();

    fireEvent.click(await searchAndGetReplaceButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    });

    expect(mocks.replaceQueueSongAction).toHaveBeenCalled();
  });
});
