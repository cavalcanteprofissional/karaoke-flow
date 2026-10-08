import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { MesasBarCard } from "./mesas-bar-card";
import { MESA_MAX } from "@/types/bar";

/**
 * Fase 17 — "Mesas do bar" saiu do `room-settings.tsx` e mora em
 * `/salas/[codigo]/sala`, junto do QR das mesas (quem mexe em mesa mexe
 * também no QR). O que estes testes travam: o limite de 1 a `MESA_MAX`, a
 * confirmação antes de REDUZIR (ela realoca gente para a mesa 1) e a
 * sincronização do valor com o que o servidor devolveu.
 */
const mocks = vi.hoisted(() => ({
  updateBarMesasAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: (...args: unknown[]) => mocks.refresh(...args) }),
}));
vi.mock("@/lib/bars/actions", () => ({
  updateBarMesasAction: (...args: unknown[]) =>
    mocks.updateBarMesasAction(...args) as unknown,
}));

function renderCard(quantidadeMesas = 3) {
  return render(<MesasBarCard bar={{ id: "bar-1", quantidade_mesas: quantidadeMesas }} />);
}

function input(): HTMLInputElement {
  // O campo é `type="number"` sem label visível (o rótulo é a descrição do
  // card), então o caminho é o papel de spinbutton.
  return screen.getByRole("spinbutton") as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("MesasBarCard", () => {
  it("mostra o total atual e limita o campo a 1..MESA_MAX", () => {
    renderCard(3);

    expect(screen.getByText(/Hoje o bar tem/i)).toBeInTheDocument();
    expect(input().min).toBe("1");
    expect(input().max).toBe(String(MESA_MAX));
    expect(screen.getByText(/De 1 a 10 mesas/i)).toBeInTheDocument();
  });

  it("valor fora da faixa nem chama a action", async () => {
    renderCard(3);

    fireEvent.change(input(), { target: { value: String(MESA_MAX + 1) } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mocks.updateBarMesasAction).not.toHaveBeenCalled());
  });

  it("aumentar não pede confirmação", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    mocks.updateBarMesasAction.mockResolvedValue({ ok: true, quantidadeMesas: 4, reallocados: 0 });
    renderCard(3);

    fireEvent.change(input(), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mocks.updateBarMesasAction).toHaveBeenCalled());

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.updateBarMesasAction).toHaveBeenCalledWith("bar-1", 4);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("diminuir exige confirmação — e cancelar não grava nada", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderCard(3);

    fireEvent.change(input(), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());

    expect(mocks.updateBarMesasAction).not.toHaveBeenCalled();
  });

  it("diminuir confirmado grava e avisa quem foi realocado", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.updateBarMesasAction.mockResolvedValue({ ok: true, quantidadeMesas: 2, reallocados: 3 });
    renderCard(3);

    fireEvent.change(input(), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(mocks.updateBarMesasAction).toHaveBeenCalledWith("bar-1", 2));

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Mesas atualizadas. 3 pessoa(s) foram para a mesa 1."
      )
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
