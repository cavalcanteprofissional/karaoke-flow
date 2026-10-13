import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { PulseiraMasterSwitch } from "./pulseira-master-switch";

/**
 * Item 5 da validação no aparelho: desligar a pulseira apaga os códigos e os
 * acessos (RPC `set_pulseiras_ativadas`), então precisa de confirmação — e
 * cancelar não pode apagar nada.
 */
const mocks = vi.hoisted(() => ({
  setPulseirasAtivadasAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/bars/pulseira-actions", () => ({
  setPulseirasAtivadasAction: (...args: unknown[]) =>
    mocks.setPulseirasAtivadasAction(...args) as unknown,
}));

function renderSwitch(initialAtivadas = true) {
  return render(
    <PulseiraMasterSwitch
      barId="bar-1"
      barNome="Karaokê do Zé"
      initialAtivadas={initialAtivadas}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("PulseiraMasterSwitch", () => {
  it("desligar avisa que apaga códigos e acessos — e cancelar não grava", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSwitch(true);

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());

    expect(window.confirm).toHaveBeenCalledWith(
      "Desligar a pulseira? Os códigos gerados e os acessos ativos serão apagados."
    );
    expect(mocks.setPulseirasAtivadasAction).not.toHaveBeenCalled();
  });

  it("desligar confirmado chama a action com ativadas=false", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.setPulseirasAtivadasAction.mockResolvedValue({ ok: true });
    renderSwitch(true);

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(mocks.setPulseirasAtivadasAction).toHaveBeenCalledWith({
        bar_id: "bar-1",
        ativadas: false,
      })
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("ligar não pede confirmação", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    mocks.setPulseirasAtivadasAction.mockResolvedValue({ ok: true });
    renderSwitch(false);

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(mocks.setPulseirasAtivadasAction).toHaveBeenCalledWith({
        bar_id: "bar-1",
        ativadas: true,
      })
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("erro da action volta o switch ao estado anterior", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.setPulseirasAtivadasAction.mockResolvedValue({ ok: false, error: "Falhou." });
    renderSwitch(true);

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falhou."));

    expect(screen.getByRole("switch")).toBeChecked();
  });
});
