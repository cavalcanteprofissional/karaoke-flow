import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SongConfirmDialog } from "./song-confirm-dialog";
import type { YouTubeVideo } from "@/lib/youtube/types";

const VIDEO: YouTubeVideo = {
  videoId: "abc123",
  title: "Evidências",
  thumbnailUrl: "https://img.youtube.com/vi/abc123/hqdefault.jpg",
  channelTitle: "Chitãozinho",
  durationSeconds: 245,
};

afterEach(() => {
  cleanup();
});

describe("SongConfirmDialog (Bloco B)", () => {
  it("fica fechado sem música pendente", () => {
    render(<SongConfirmDialog video={null} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mostra thumbnail, título e duração antes de confirmar", () => {
    render(<SongConfirmDialog video={VIDEO} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Evidências")).toBeInTheDocument();
    expect(screen.getByText("4:05")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Miniatura de Evidências" })).toHaveAttribute(
      "src",
      "https://img.youtube.com/vi/abc123/hqdefault.jpg"
    );
  });

  it("confirmar devolve a música para quem vai adicionar", () => {
    const onConfirm = vi.fn();
    render(<SongConfirmDialog video={VIDEO} onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onConfirm).toHaveBeenCalledWith(VIDEO);
  });

  it("cancelar não confirma nada", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<SongConfirmDialog video={VIDEO} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("escapar também cancela (não Adds)", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<SongConfirmDialog video={VIDEO} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("enquanto envia, os dois botões ficam travados", () => {
    const onConfirm = vi.fn();
    render(
      <SongConfirmDialog video={VIDEO} busy onConfirm={onConfirm} onCancel={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });

  it("sem thumbnail, mostra o ícone no lugar da imagem", () => {
    render(
      <SongConfirmDialog
        video={{ ...VIDEO, thumbnailUrl: null }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Evidências")).toBeInTheDocument();
  });
});

describe("SongConfirmDialog — modo troca (Bloco D)", () => {
  it("promete manter posição e aprovação e renomeia o botão", () => {
    render(
      <SongConfirmDialog
        video={VIDEO}
        mode="replace"
        replaceItemTitle="Evidências (toca agora)"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByRole("heading", { name: /Trocar a música da fila\?/ })
    ).toBeInTheDocument();
    expect(screen.getByText("Evidências (toca agora)")).toBeInTheDocument();
    expect(
      screen.getByText(/posição na fila e a aprovação são mantidas/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trocar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("no modo troca o botão chama a troca com a música escolhida", () => {
    const onConfirm = vi.fn();
    render(
      <SongConfirmDialog
        video={VIDEO}
        mode="replace"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    expect(onConfirm).toHaveBeenCalledWith(VIDEO);
  });
});
