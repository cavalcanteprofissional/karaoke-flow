import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mapMock = vi.hoisted(() => ({ props: [] as unknown[] }));
const actionMock = vi.hoisted(() => ({ updateBarRadiusAction: vi.fn() }));

vi.mock("@/components/bars/presence-radius-map", () => ({
  PresenceRadiusMap: (props: unknown) => {
    mapMock.props.push(props);
    return <div data-testid="presence-radius-map" />;
  },
}));

vi.mock("@/lib/bars/actions", () => ({
  updateBarRadiusAction: actionMock.updateBarRadiusAction,
}));

import { PresenceGateInfo } from "./presence-gate-info";

/** O texto do aviso vem quebrado em `<strong>` + `{radius}`, então casa contra o
 *  textContent normalizado em vez de um elemento só. */
function textOf(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

function lastRadiusProps(): { radiusMeters: number } {
  return mapMock.props[mapMock.props.length - 1] as { radiusMeters: number };
}

const base = {
  barId: "bar-1",
  barName: "Bar da Esquina",
  address: "Rua das Flores, 120",
  city: "São Paulo",
  latitude: -23.5613,
  longitude: -46.6565,
  radiusMeters: 500,
};

describe("PresenceGateInfo", () => {
  beforeEach(() => {
    mapMock.props = [];
    actionMock.updateBarRadiusAction.mockReset();
    actionMock.updateBarRadiusAction.mockResolvedValue({ ok: true, radiusMeters: 500 });
  });

  afterEach(() => {
    cleanup();
  });

  it("avisa que o gate barra mesmo com entrada livre ligada", () => {
    const { container } = render(
      <PresenceGateInfo {...base} entryModeApproval={false} />
    );
    const text = textOf(container);

    expect(text).toMatch(/entrada livre ligada o guest entra direto na sala/);
    expect(text).toMatch(/o gate de localização continua valendo/);
    expect(text).toMatch(/fora de 500 m do bar, a entrada é bloqueada/);
    expect(text).toMatch(/O host nunca é bloqueado/);
  });

  it("avisa que a aprovação exige estar dentro do raio", () => {
    const { container } = render(<PresenceGateInfo {...base} entryModeApproval />);

    expect(textOf(container)).toMatch(
      /entrada com aprovação ligada, quem estiver fora de 500 m do bar é bloqueado/
    );
  });

  it("desenha o mapa com o raio em vigor e mostra a metragem", () => {
    render(<PresenceGateInfo {...base} entryModeApproval />);

    expect(mapMock.props).toHaveLength(1);
    expect(mapMock.props[0]).toMatchObject({
      latitude: -23.5613,
      longitude: -46.6565,
      radiusMeters: 500,
      barName: "Bar da Esquina",
    });
  });

  it("libera o campo do raio para o host (50–1000 m, de 50 em 50)", () => {
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença") as HTMLInputElement;
    expect(input).toBeEnabled();
    expect(input.value).toBe("500");
    expect(input).toHaveAttribute("min", "50");
    expect(input).toHaveAttribute("max", "1000");
    expect(input).toHaveAttribute("step", "50");
    expect(screen.queryByText(/Personalização em breve/i)).toBeNull();
  });

  it("propaga a prévia ao mapa enquanto o host digita, sem salvar", async () => {
    const user = userEvent.setup();
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença");
    await user.clear(input);
    await user.type(input, "250");

    expect(lastRadiusProps().radiusMeters).toBe(250);
    expect(screen.getByText(/Ajuste para salvar/i)).toBeInTheDocument();
    expect(actionMock.updateBarRadiusAction).not.toHaveBeenCalled();
  });

  it("salva o raio ao sair do campo e confirma o valor em vigor", async () => {
    const user = userEvent.setup();
    actionMock.updateBarRadiusAction.mockResolvedValue({ ok: true, radiusMeters: 300 });
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença");
    await user.clear(input);
    await user.type(input, "300");
    await user.tab();

    expect(actionMock.updateBarRadiusAction).toHaveBeenCalledWith("bar-1", 300);
    await waitFor(() => expect(screen.getByText(/Salvo às/i)).toBeInTheDocument());
  });

  it("alinha o raio no passo de 50 m ao confirmar", async () => {
    const user = userEvent.setup();
    actionMock.updateBarRadiusAction.mockResolvedValue({ ok: true, radiusMeters: 550 });
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença");
    await user.clear(input);
    await user.type(input, "540");
    await user.tab();

    expect(actionMock.updateBarRadiusAction).toHaveBeenCalledWith("bar-1", 550);
    await waitFor(() =>
      expect((screen.getByLabelText("Raio de presença") as HTMLInputElement).value).toBe("550")
    );
  });

  it("não grava quando o raio volta para o valor já em vigor", async () => {
    const user = userEvent.setup();
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "520");
    await user.tab();

    expect(input.value).toBe("500");
    expect(actionMock.updateBarRadiusAction).not.toHaveBeenCalled();
  });

  it("grava sozinho (debounce) o que o host digitar, sem blur", async () => {
    const user = userEvent.setup();
    actionMock.updateBarRadiusAction.mockResolvedValue({ ok: true, radiusMeters: 250 });
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença");
    await user.clear(input);
    await user.type(input, "250");

    await waitFor(() =>
      expect(actionMock.updateBarRadiusAction).toHaveBeenCalledWith("bar-1", 250)
    );
  });

  it("move o raio pelo slider e grava o novo valor", async () => {
    actionMock.updateBarRadiusAction.mockResolvedValue({ ok: true, radiusMeters: 550 });
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const thumb = screen.getByRole("slider", { name: /ajustar raio de presença/i });

    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(lastRadiusProps().radiusMeters).toBe(550);
    expect(actionMock.updateBarRadiusAction).toHaveBeenCalledWith("bar-1", 550);
    await waitFor(() => expect(screen.getByText(/Salvo às/i)).toBeInTheDocument());

    actionMock.updateBarRadiusAction.mockResolvedValue({ ok: true, radiusMeters: 500 });
    fireEvent.keyDown(thumb, { key: "ArrowLeft" });
    expect(actionMock.updateBarRadiusAction).toHaveBeenLastCalledWith("bar-1", 500);
  });

  it("recusa valor fora da faixa sem chamar o banco", async () => {
    const user = userEvent.setup();
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença");
    await user.clear(input);
    await user.type(input, "1200");

    expect(screen.getByRole("alert")).toHaveTextContent(/raio máximo é 1000 m/i);
    await user.tab();
    expect(actionMock.updateBarRadiusAction).not.toHaveBeenCalled();
  });

  it("volta ao valor do banco quando a gravação falha", async () => {
    const user = userEvent.setup();
    actionMock.updateBarRadiusAction.mockResolvedValue({
      ok: false,
      error: "Só o dono do bar pode mudar o raio de presença.",
    });
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença");
    await user.clear(input);
    await user.type(input, "800");
    await user.tab();

    await waitFor(() =>
      expect((screen.getByLabelText("Raio de presença") as HTMLInputElement).value).toBe("500")
    );
    expect(lastRadiusProps().radiusMeters).toBe(500);
    expect(screen.getByRole("alert")).toHaveTextContent(/Só o dono do bar/i);
  });

  it("restaura o padrão de 500 m", async () => {
    const user = userEvent.setup();
    actionMock.updateBarRadiusAction.mockResolvedValue({ ok: true, radiusMeters: 500 });
    render(<PresenceGateInfo {...base} radiusMeters={200} entryModeApproval />);

    await user.click(screen.getByRole("button", { name: /Restaurar 500 m/i }));

    expect(actionMock.updateBarRadiusAction).toHaveBeenCalledWith("bar-1", 500);
    expect(lastRadiusProps().radiusMeters).toBe(500);
  });

  it("avisa que bar sem coordenadas bloqueia todo mundo quando não há mapa", () => {
    render(
      <PresenceGateInfo
        {...base}
        latitude={null}
        longitude={null}
        address={null}
        city={null}
        entryModeApproval
      />
    );

    expect(mapMock.props).toHaveLength(0);
    expect(screen.queryByTestId("presence-radius-map")).toBeNull();
    expect(
      screen.getByText(/bloqueia a entrada de todo participante/i)
    ).toBeInTheDocument();
  });
});
