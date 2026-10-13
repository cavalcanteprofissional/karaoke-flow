import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { QrScanner } from "./qr-scanner";

/**
 * Item 4 da validação no aparelho: a câmera não parava de verdade ao fechar o
 * diálogo (o `stopRef` era zerado antes do `stop()`), então a segunda abertura
 * falhava. E toda falha virava a mesma mensagem. Os dois comportamentos ficam
 * travados aqui.
 */
const mocks = vi.hoisted(() => ({
  decodeFromVideoDevice: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromVideoDevice(...args: unknown[]) {
      return mocks.decodeFromVideoDevice(...args);
    }
  },
}));

function setCameraAvailable(available: boolean) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: available ? { getUserMedia: vi.fn() } : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  setCameraAvailable(true);
  mocks.decodeFromVideoDevice.mockResolvedValue({ stop: mocks.stop });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  setCameraAvailable(false);
});

describe("QrScanner", () => {
  it("abrir o diálogo inicia a leitura da câmera", async () => {
    render(<QrScanner onResult={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Escanear QR/i }));
    await waitFor(() => expect(mocks.decodeFromVideoDevice).toHaveBeenCalledTimes(1));
  });

  it("fechar o diálogo PARA o stream (a falha da 2ª abertura)", async () => {
    render(<QrScanner onResult={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Escanear QR/i }));
    await waitFor(() => expect(mocks.decodeFromVideoDevice).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Fechar/i }));
    await waitFor(() => expect(mocks.stop).toHaveBeenCalled());
  });

  it("sem câmera no navegador mostra mensagem acionável", async () => {
    setCameraAvailable(false);
    render(<QrScanner onResult={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Escanear QR/i }));

    expect(await screen.findByText(/não dá acesso à câmera/i)).toBeInTheDocument();
    expect(mocks.decodeFromVideoDevice).not.toHaveBeenCalled();
  });

  it("câmera negada explica a permissão, não 'verifique a permissão' genérico", async () => {
    const denied = new DOMException("denied", "NotAllowedError");
    mocks.decodeFromVideoDevice.mockRejectedValue(denied);
    render(<QrScanner onResult={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Escanear QR/i }));

    expect(await screen.findByText(/Permita o acesso à câmera/i)).toBeInTheDocument();
  });

  it("câmera em uso por outro app tem mensagem própria", async () => {
    mocks.decodeFromVideoDevice.mockRejectedValue(
      new DOMException("busy", "NotReadableError")
    );
    render(<QrScanner onResult={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Escanear QR/i }));

    expect(await screen.findByText(/em uso por outro app/i)).toBeInTheDocument();
  });

  it("QR reconhecido fecha e entrega o token", async () => {
    const onResult = vi.fn();
    render(<QrScanner onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: /Escanear QR/i }));
    await waitFor(() => expect(mocks.decodeFromVideoDevice).toHaveBeenCalledTimes(1));

    const callback = mocks.decodeFromVideoDevice.mock.calls[0][2] as (
      result: unknown,
      error: unknown,
      controls: { stop: () => void }
    ) => void;
    callback({ getText: () => "KARAOKE" }, null, { stop: mocks.stop });

    await waitFor(() => expect(onResult).toHaveBeenCalledWith("KARAOKE"));
  });
});
