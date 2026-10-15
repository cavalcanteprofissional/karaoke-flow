import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { DesktopNav } from "./desktop-nav";

afterEach(cleanup);

describe("DesktopNav", () => {
  it("liga as duas telas do app (Início e Entrar)", () => {
    render(<DesktopNav />);

    expect(screen.getByRole("link", { name: /Início/ })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: /Entrar/ })).toHaveAttribute(
      "href",
      "/entrar"
    );
  });

  it("marca o item ativo pelo pathname (com startsWith, menos no matchExact)", () => {
    pathname = "/dashboard";
    const { rerender } = render(<DesktopNav />);
    expect(screen.getByRole("link", { name: /Início/ })).toHaveAttribute(
      "aria-current",
      "page"
    );

    // `/entrar` é `matchExact`: uma rota filha não marca o item.
    pathname = "/entrar/confirmado";
    rerender(<DesktopNav />);
    expect(screen.getByRole("link", { name: /Entrar/ })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("é escondido no mobile e aparece a partir de md", () => {
    render(<DesktopNav />);
    expect(screen.getByRole("navigation")).toHaveClass("hidden", "md:flex");
  });
});
