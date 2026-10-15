import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: () => {}, resolvedTheme: "dark" }),
}));

import { AppShell } from "./app-shell";

afterEach(cleanup);

describe("AppShell", () => {
  it("mantém o rodapé fora do <main> (senão ele não vira landmark contentinfo)", () => {
    render(
      <AppShell
        footer={
          <footer>
            <a href="/sobre">Sobre</a>
          </footer>
        }
      >
        <p>conteúdo</p>
      </AppShell>
    );

    const main = screen.getByRole("main");
    expect(main).toContainElement(
      screen.getByText("conteúdo").closest("p") as HTMLElement
    );
    // o rodapé é irmão de <main>, não descendente dele
    const footer = screen.getByText("Sobre").closest("footer") as HTMLElement;
    expect(footer).toBeTruthy();
    expect(main.contains(footer)).toBe(false);
    expect(main.parentElement?.contains(footer)).toBe(true);
  });

  it("renderiza o conteúdo dentro do <main>", () => {
    render(<AppShell>conteúdo</AppShell>);

    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("conteúdo");
  });
});
