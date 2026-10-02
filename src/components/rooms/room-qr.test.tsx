import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoomQr } from "@/components/rooms/room-qr";

const toDataURL = vi.fn();

vi.mock("qrcode", () => ({
  default: {
    toDataURL: (...args: unknown[]) => toDataURL(...args),
  },
}));

describe("RoomQr", () => {
  beforeEach(() => {
    toDataURL.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("mostra o skeleton e depois a imagem", async () => {
    toDataURL.mockResolvedValue("data:image/png;base64,AAA");
    const { container } = render(<RoomQr value="https://exemplo.com/entrar?code=ABC" />);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/png;base64,AAA");
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  /**
   * Regressão do bug reportado: o `catch` fazia só `setDataUrl(null)`, o
   * componente caía no mesmo branch do "carregando" e ficava num skeleton
   * eterno, sem log e sem dizer o que houve. Na TV, isso é um Quadrado
   * piscando para sempre sem pista nenhuma.
   */
  it("mostra erro com o código quando a geração falha, em vez de skeleton eterno", async () => {
    toDataURL.mockRejectedValue(new Error("canvas indisponível"));
    render(<RoomQr value="https://exemplo.com/entrar?code=ABC" fallbackLabel="ABC123" />);

    await waitFor(() =>
      expect(screen.getByText(/não foi possível gerar o qr/i)).toBeInTheDocument()
    );
    // O código à mão é a saída: sem QR, a pessoa ainda consegue entrar.
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith(
      "[RoomQr] falha ao gerar o QR",
      expect.objectContaining({ value: "https://exemplo.com/entrar?code=ABC" })
    );
    // Nada de imagem quebrada e nada de spinner para sempre.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("não deixa o erro de uma geração antiga contaminar a próxima", async () => {
    toDataURL.mockRejectedValueOnce(new Error("falhou"));
    const { rerender } = render(<RoomQr value="url-antiga" fallbackLabel="VELHO" />);
    await waitFor(() =>
      expect(screen.getByText(/não foi possível gerar o qr/i)).toBeInTheDocument()
    );

    toDataURL.mockResolvedValueOnce("data:image/png;base64,BBB");
    rerender(<RoomQr value="url-nova" fallbackLabel="NOVO" />);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    // O erro do `value` anterior não pode continuar na tela.
    expect(screen.queryByText(/não foi possível gerar o qr/i)).not.toBeInTheDocument();
    expect(screen.queryByText("VELHO")).not.toBeInTheDocument();
  });

  it("oferece download quando showDownload está ligado", async () => {
    toDataURL.mockResolvedValue("data:image/png;base64,CCC");
    render(<RoomQr value="https://exemplo.com" fileName="qr-sala.png" />);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    const link = screen.getByRole("link", { name: /baixar qr/i });
    expect(link).toHaveAttribute("download", "qr-sala.png");
    expect(link).toHaveAttribute("href", "data:image/png;base64,CCC");
  });

  it("esconde download quando showDownload é false (tela da TV)", async () => {
    toDataURL.mockResolvedValue("data:image/png;base64,DDD");
    render(<RoomQr value="https://exemplo.com" showDownload={false} />);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
