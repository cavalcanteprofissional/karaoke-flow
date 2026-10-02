import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const qrMock = vi.hoisted(() => ({ toDataURL: vi.fn() }));

vi.mock("qrcode", () => ({ default: { toDataURL: qrMock.toDataURL } }));

import { PixDonation } from "./pix-donation";
import { readPixPayload } from "@/lib/pix/brcode";

const base = { chave: "cavalcante@outlook.com", nome: "Lucas Cavalcante", cidade: "Sao Paulo" };

/** O textarea copia-e-cola é o que o doador usa se o QR não carregar. */
function payloadNaTela(): string {
  return (screen.getByLabelText(/Código Pix/i) as HTMLTextAreaElement).value;
}

describe("PixDonation", () => {
  beforeEach(() => {
    qrMock.toDataURL.mockReset();
    qrMock.toDataURL.mockResolvedValue("data:image/png;base64,FAKE");
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * O QR é o caminho principal, mas o que o banco lê é o texto: se o payload
   * não tiver valor nenhum (ou o valor errado), o doador paga uma quantia
   * inesperada ou o app recusa.
   */
  it("embute o valor escolhido no código copia e cola", async () => {
    render(<PixDonation {...base} />);

    await waitFor(() => expect(qrMock.toDataURL).toHaveBeenCalled());
    expect(readPixPayload(payloadNaTela()).valor).toBe("5.00");

    fireEvent.click(screen.getByRole("button", { name: /R\$\s?10,00/ }));
    await waitFor(() => expect(readPixPayload(payloadNaTela()).valor).toBe("10.00"));

    fireEvent.click(screen.getByRole("button", { name: /R\$\s?2,00/ }));
    await waitFor(() => expect(readPixPayload(payloadNaTela()).valor).toBe("2.00"));
  });

  it("aceita valor digitado à mão", async () => {
    render(<PixDonation {...base} />);
    await waitFor(() => expect(qrMock.toDataURL).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/Outro valor/i), { target: { value: "7.5" } });

    await waitFor(() => expect(readPixPayload(payloadNaTela()).valor).toBe("7.50"));
  });

  it("gera um payload com CRC válido — o que o app do banco checa", async () => {
    render(<PixDonation {...base} />);
    await waitFor(() => expect(qrMock.toDataURL).toHaveBeenCalled());

    const lido = readPixPayload(payloadNaTela());
    expect(lido.crcValido).toBe(true);
    expect(lido.chave).toBe(base.chave);
    expect(qrMock.toDataURL).toHaveBeenCalledWith(
      payloadNaTela(),
      expect.objectContaining({ margin: 1 })
    );
  });

  it("copia o código para a área de transferência", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PixDonation {...base} />);
    await waitFor(() => expect(qrMock.toDataURL).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Copiar código Pix/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(payloadNaTela()));
    expect(await screen.findByRole("button", { name: /Copiado!/ })).toBeInTheDocument();
  });

  it("avisa quando o navegador bloqueia a cópia, sem fingir que copiou", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("nope")) } });
    render(<PixDonation {...base} />);
    await waitFor(() => expect(qrMock.toDataURL).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Copiar código Pix/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/bloqueou a cópia/i);
  });

  it("mantém a chave visível quando o QR não gera (fallback é copiar e colar)", async () => {
    qrMock.toDataURL.mockRejectedValue(new Error("canvas indisponível"));
    render(<PixDonation {...base} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível gerar o QR/);
    expect(payloadNaTela()).not.toBe("");
    expect(screen.getByText(base.chave)).toBeInTheDocument();
  });

  it("chave inválida não derruba a seção: mostra o erro e a chave para copiar", async () => {
    render(<PixDonation chave="   " nome={base.nome} cidade={base.cidade} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/chave Pix está vazia/i);
    expect(screen.getByRole("button", { name: /Copiar código Pix/i })).toBeDisabled();
  });
});
