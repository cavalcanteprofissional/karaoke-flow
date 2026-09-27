import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PlayerErrorBoundary } from "./player-error-boundary";

/**
 * A TV não pode morrer por exceção (Fase 8a, correção do player): o player do
 * YouTube é código de terceiro dentro de um iframe e a tela tem que continuar
 * mostrando pelo menos o aviso.
 */
describe("PlayerErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("deixa a tela passar quando nada quebra", () => {
    render(
      <PlayerErrorBoundary>
        <p>Fila tocando</p>
      </PlayerErrorBoundary>
    );

    expect(screen.getByText("Fila tocando")).toBeInTheDocument();
  });

  it("troca a tela quebrada por um aviso com como recuperar", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Quebrado(): never {
      throw new Error("player.loadVideoById is not a function");
    }

    render(
      <PlayerErrorBoundary>
        <Quebrado />
      </PlayerErrorBoundary>
    );

    expect(screen.getByText(/Não foi possível tocar esta música/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Recarregar o player/ })
    ).toBeInTheDocument();
    // Diagnóstico para quem está longe da TV, sem virar a única pista.
    expect(console.error).toHaveBeenCalledWith(
      "[player] a tela do player quebrou:",
      expect.any(Error)
    );
  });
});
