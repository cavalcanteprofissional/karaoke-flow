import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { HostScreenNav } from "./host-screen-nav";

/**
 * Fase 17 — a navegação do host entre as telas de configuração. Ela é a
 * prova de que as quatro rotas existem e se ligam: sem este componente o host
 * só descobriria `/bar/[codigo]` digitando o endereço na mão.
 */
afterEach(cleanup);

function links(): { name: string; href: string | null }[] {
  return screen.getAllByRole("link").map((el) => ({
    name: el.textContent ?? "",
    href: el.getAttribute("href"),
  }));
}

describe("HostScreenNav", () => {
  it("liga as três telas da sala quando a casa não tem bar", () => {
    render(<HostScreenNav roomCode="KARAOKE" barCode={null} />);

    const hrefs = links().map((l) => l.href);
    expect(hrefs).toEqual([
      "/salas/KARAOKE/player",
      "/salas/KARAOKE/sala",
      "/salas/KARAOKE/pulseiras",
    ]);
    expect(screen.queryByText("Bar")).toBeNull();
  });

  it("acrescenta a tela do bar quando a sala tem casa", () => {
    render(<HostScreenNav roomCode="KARAOKE" barCode="BARZADA" />);

    const hrefs = links().map((l) => l.href);
    expect(hrefs).toEqual([
      "/salas/KARAOKE/player",
      "/salas/KARAOKE/sala",
      "/salas/KARAOKE/pulseiras",
      "/bar/BARZADA",
    ]);
    expect(screen.getByText("Bar")).toBeInTheDocument();
  });

  it("cada item explica o que fica naquela tela", () => {
    render(<HostScreenNav roomCode="KARAOKE" barCode="BARZADA" />);

    expect(screen.getByText(/TV, fila e pedidos de entrada/)).toBeInTheDocument();
    expect(screen.getByText(/Como funciona, mesas e código/)).toBeInTheDocument();
    expect(screen.getByText(/Códigos e valores/)).toBeInTheDocument();
    expect(screen.getByText(/Raio de presença e busca do YouTube/)).toBeInTheDocument();
  });
});
