import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BarQr } from "@/components/rooms/bar-qr";

const toDataURL = vi.fn();

vi.mock("qrcode", () => ({
  default: {
    toDataURL: (...args: unknown[]) => toDataURL(...args),
  },
}));

/** O `value` com que o QR foi gerado — é o que prova de onde a URL saiu. */
function valorGerado(): string {
  return String(toDataURL.mock.calls.at(-1)?.[0]);
}

describe("BarQr", () => {
  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue("data:image/png;base64,AAA");
  });

  /**
   * `NEXT_PUBLIC_APP_URL` é inlinada no bundle em **build time**, então num
   * preview da Vercel ela continua apontando para a produção. O QR do quiosque e
   * o das mesas já saíam pelo origin do cliente; o do bar era montado na server
   * component e ficava na env — metade dos QR apontava para o app errado.
   */
  it("codifica o host que o browser está vendo, não o da env", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://karaoke-producao.vercel.app");
    const origem = "https://karaoke-abc123-luiz.vercel.app";

    Object.defineProperty(window, "location", {
      value: { origin: origem },
      writable: true,
      configurable: true,
    });

    render(<BarQr barCode="XED123" barNome="Bar do Zé" />);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    expect(valorGerado()).toBe(`${origem}/entrar?bar=XED123`);

    vi.unstubAllEnvs();
  });

  it("mantém o código do bar e o nome do arquivo", async () => {
    render(<BarQr barCode="XED123" barNome="Bar do Zé" />);

    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    expect(screen.getByRole("img")).toHaveAttribute("alt", "QR do bar Bar do Zé");
    expect(screen.getByRole("link", { name: /baixar qr/i })).toHaveAttribute(
      "download",
      "qr-bar-XED123.png"
    );
  });
});
