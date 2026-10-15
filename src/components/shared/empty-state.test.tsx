import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Power } from "lucide-react";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza título, descrição e ação na variante com borda", () => {
    render(
      <EmptyState
        icon={Power}
        title="Sala encerrada"
        description="A fila foi cancelada."
        action={<a href="/dashboard">Voltar</a>}
      />
    );

    expect(screen.getByText("Sala encerrada")).toBeInTheDocument();
    expect(screen.getByText("A fila foi cancelada.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  it("não desenha a caixa tracejada na variante quiet", () => {
    const { container } = render(
      <EmptyState variant="quiet" description="A fila está vazia." />
    );

    expect(screen.getByText("A fila está vazia.")).toBeInTheDocument();
    expect(container.querySelector(".border-dashed")).toBeNull();
  });

  it("mostra a caixa tracejada na variante padrão", () => {
    const { container } = render(<EmptyState title="Nada por aqui ainda" />);

    expect(container.querySelector(".border-dashed")).not.toBeNull();
  });
});
