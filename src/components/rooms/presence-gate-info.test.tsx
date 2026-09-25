import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mapMock = vi.hoisted(() => ({ props: [] as unknown[] }));

vi.mock("@/components/bars/presence-radius-map", () => ({
  PresenceRadiusMap: (props: unknown) => {
    mapMock.props.push(props);
    return <div data-testid="presence-radius-map" />;
  },
}));

import { PresenceGateInfo } from "./presence-gate-info";

/** O texto do aviso vem quebrado em `<strong>` + `{radiusMeters}`, então casa
 *  contra o textContent normalizado em vez de um elemento só. */
function textOf(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

const base = {
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

  it("mantém o raio bloqueado, visível e desabilitado", () => {
    render(<PresenceGateInfo {...base} entryModeApproval />);

    const input = screen.getByLabelText("Raio de presença") as HTMLInputElement;
    expect(input.value).toBe("500 m");
    expect(input).toBeDisabled();
    expect(screen.getByText(/Personalização em breve/i)).toBeInTheDocument();
  });

  it("propaga o raio novo para o mapa sem recarregar a tela", () => {
    const { rerender } = render(<PresenceGateInfo {...base} entryModeApproval />);
    rerender(<PresenceGateInfo {...base} radiusMeters={250} entryModeApproval />);

    expect(
      (mapMock.props[mapMock.props.length - 1] as { radiusMeters: number }).radiusMeters
    ).toBe(250);
    expect((screen.getByLabelText("Raio de presença") as HTMLInputElement).value).toBe(
      "250 m"
    );
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
