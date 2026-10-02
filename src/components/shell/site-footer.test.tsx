import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";

import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * A assinatura é a mesma do linktree do dev — se o arquivo não vier no
   * repositório, o rodapé aparece com imagem quebrada em toda tela logada.
   * O teste descobre isso no CI, não no bar às 22h.
   */
  it("mostra a assinatura do dev como imagem (não como texto solto)", () => {
    render(<SiteFooter />);
    const imagem = screen.getByAltText("Lucas Cavalcante");

    // `next/image` reescreve o src para o otimizador; o que importa é que ele
    // aponte para o arquivo certo.
    expect(imagem.getAttribute("src")).toContain("assinatura-lucas.png");
  });

  /**
   * O `src` acima não prova que o arquivo está no repositório — e é o arquivo
   * que falta que deixa a imagem quebrada em toda tela logada. Então o teste
   * olha o disco: build e deploy não salvam aqui.
   */
  it("tem a assinatura no repositório (build não pode quebrar a imagem)", () => {
    expect(
      existsSync(join(process.cwd(), "public", "images", "assinatura-lucas.png"))
    ).toBe(true);
  });

  it("credita o dev e leva ao GitHub dele", () => {
    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: /Produzido por/i });
    expect(link).toHaveAttribute("href", "https://github.com/cavalcanteprofissional");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("leva à página /sobre, onde está a doação", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Sobre" })).toHaveAttribute("href", "/sobre");
  });

  it("põe o ano corrente — e só um, para não brigar com a hidratação", () => {
    render(<SiteFooter />);
    const ano = new Date().getFullYear();

    expect(screen.getByText(new RegExp(`${ano}`))).toBeInTheDocument();
  });
});
