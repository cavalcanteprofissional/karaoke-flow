import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import {
  CONSENT_COOKIE,
  GEO_COOKIE,
  PREFERENCES_COOKIE,
  deleteCookie,
  hasConsent,
} from "@/lib/consent/cookies";
import { Onboarding } from "./onboarding";

function setNavigatorLanguage(lang: string) {
  Object.defineProperty(navigator, "language", {
    value: lang,
    configurable: true,
  });
  Object.defineProperty(navigator, "languages", {
    value: [lang],
    configurable: true,
  });
}

describe("Onboarding (Tela 1)", () => {
  beforeEach(() => {
    push.mockClear();
    [CONSENT_COOKIE, PREFERENCES_COOKIE, GEO_COOKIE].forEach(deleteCookie);
    setNavigatorLanguage("pt-BR");
  });

  it("mostra os dois botões da bifurcação no idioma do navegador", () => {
    render(<Onboarding />);
    expect(screen.getByRole("button", { name: "Quero cantar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sou dono" })).toBeInTheDocument();
  });

  it("mostra o banner de consentimento antes do aceite e não coopera", () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: "Quero cantar" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(hasConsent()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("ao aceitar, marca o consentimento e navega ao perfil escolhido", () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: "Sou dono" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));

    expect(hasConsent()).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("com consentimento já dado, navega direto sem banner", () => {
    document.cookie = `${CONSENT_COOKIE}=1; path=/`;
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: "Quero cantar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("é localizado quando o idioma do navegador é outro suportado", () => {
    setNavigatorLanguage("en-US");
    render(<Onboarding />);
    expect(screen.getByRole("button", { name: "I want to sing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I'm a host" })).toBeInTheDocument();
  });
});
