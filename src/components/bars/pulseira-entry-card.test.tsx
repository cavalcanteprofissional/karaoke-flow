import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PulseiraPreco } from "@/types/bar";

const mocks = vi.hoisted(() => {
  const router = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    router,
    toast,
    lastRedeem: undefined as unknown | undefined,
    precoPulseiraHoje: vi.fn<(precos: PulseiraPreco[], agora?: Date) => number | null>(
      () => 1500
    ),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toast.success(...args),
    error: (...args: unknown[]) => mocks.toast.error(...args),
  },
}));

vi.mock("@/lib/bars/pulseiras", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/bars/pulseiras")>();
  return {
    ...original,
    // Determinismo de relógio: "valor de hoje" é um mock; o resto do módulo
    // (formatCentavos etc.) segue o original.
    precoPulseiraHoje: mocks.precoPulseiraHoje,
  };
});

vi.mock("@/lib/bars/pulseira-actions", () => ({
  resgatarPulseiraAction: (raw: unknown) => {
    mocks.lastRedeem = raw;
    return Promise.resolve({
      ok: true,
      message: "Pulseira ativa por 24 horas. Bom cantar!",
      precoCentavos: 1500,
      acessoAte: "2026-10-09T03:00:00.000Z",
      nome: "Bar da Esquina",
    });
  },
}));

import { PulseiraEntryCard } from "./pulseira-entry-card";

const baseProps = {
  barId: "bar-1",
  barName: "Bar da Esquina",
  pulseirasAtivadas: true,
  precos: [],
  initialPulseira: null,
  isAnonymous: false,
  temPulseira: false,
};

describe("PulseiraEntryCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.lastRedeem = undefined;
  });

  it("some quando a casa não usa pulseira", () => {
    const { container } = render(
      <PulseiraEntryCard {...baseProps} pulseirasAtivadas={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o cartaz de valores do dia", () => {
    render(<PulseiraEntryCard {...baseProps} />);
    // O Intl usa espaço estreito (não-ASCII) entre "R$" e o valor; casar o
    // parágrafo inteiro (textContent) evita depender do caractere exato.
    const found = screen.getAllByText((_content, element) => {
      const text = element?.textContent ?? "";
      return text.includes("valor de hoje") && text.includes("15,00");
    });
    expect(found.length).toBeGreaterThan(0);
  });

  it("sem faixa cadastrada mostra que a pulseira é de graça", () => {
    mocks.precoPulseiraHoje.mockReturnValue(null);
    render(<PulseiraEntryCard {...baseProps} />);
    expect(screen.getByText(/pulseira é liberada de graça/)).toBeTruthy();
  });

  it("preenche e normaliza o código que veio no QR", () => {
    render(<PulseiraEntryCard {...baseProps} initialPulseira="abc234" />);
    const input = screen.getByLabelText("Código da pulseira") as HTMLInputElement;
    expect(input.value).toBe("ABC234");
  });

  it("usuário anônimo não vê formulário e orienta criar conta", () => {
    render(<PulseiraEntryCard {...baseProps} isAnonymous />);
    expect(screen.queryByLabelText("Código da pulseira")).toBeNull();
    expect(screen.getByText(/Crie uma conta/)).toBeTruthy();
  });

  it("quem já tem a pulseira ativa vê o estado pronto", () => {
    render(<PulseiraEntryCard {...baseProps} temPulseira />);
    expect(screen.getByText(/Pulseira ativa/)).toBeTruthy();
  });

  it("resgata pelo código digitado e avisa", async () => {
    render(<PulseiraEntryCard {...baseProps} initialPulseira="ZK7Q2P" />);
    fireEvent.click(screen.getByRole("button", { name: /Ativar pulseira/ }));

    await waitFor(() => {
      expect(mocks.lastRedeem).toEqual({ bar_id: "bar-1", codigo: "ZK7Q2P" });
    });
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Pulseira ativa por 24 horas. Bom cantar!"
    );
    expect(mocks.router.refresh).toHaveBeenCalled();
    expect(await screen.findByText(/Pulseira ativa/)).toBeTruthy();
  });

  it("desabilita o botão com código curto demais", () => {
    render(<PulseiraEntryCard {...baseProps} initialPulseira="AB" />);
    expect(
      screen.getByRole("button", { name: /Ativar pulseira/ })
    ).toBeDisabled();
  });
});