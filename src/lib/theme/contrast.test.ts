import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  contrastOnTint,
  contrastRatio,
  extractBlock,
  parseOklchTokens,
  type Oklch,
} from "./contrast";

/**
 * Guarda de contraste do design system (design-system §1.3). Lê os tokens do
 * `.dark` em `globals.css` e falha se algum par de texto cair abaixo de AA
 * (4.5:1). O app é **dark-first** (decisão do dono, 2026-10-14): só o tema
 * escuro é auditado aqui.
 */
const css = readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
const dark = parseOklchTokens(extractBlock(css, "\n.dark {"));

const AA = 4.5;

function token(name: string): Oklch {
  const value = dark[name];
  if (!value) throw new Error(`Token --${name} ausente no bloco .dark de globals.css`);
  return value;
}

describe("contraste AA — texto sobre superfície (tema escuro)", () => {
  const pairs: Array<[string, string, string]> = [
    ["foreground", "background", "texto padrão sobre o fundo"],
    ["foreground", "card", "texto padrão sobre o card"],
    ["muted-foreground", "background", "texto secundário sobre o fundo"],
    ["muted-foreground", "card", "texto secundário sobre o card"],
    ["secondary-foreground", "secondary", "texto sobre superfície secundária"],
    ["primary-foreground", "primary", "texto do botão primário"],
    ["highlight-foreground", "highlight", "texto sobre o ciano de destaque"],
  ];

  it.each(pairs)("--%s sobre --%s (%s)", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(AA);
  });
});

describe("contraste AA — tokens semânticos como texto sobre o card", () => {
  const semantica = ["primary", "highlight", "success", "warning", "info", "destructive"];

  it.each(semantica)("--%s como texto sobre --card", (name) => {
    expect(contrastRatio(token(name), token("card"))).toBeGreaterThanOrEqual(AA);
  });
});

describe("contraste AA — texto sobre fundo sólido do próprio token", () => {
  const pares: Array<[string, string]> = [
    ["success-foreground", "success"],
    ["warning-foreground", "warning"],
    ["info-foreground", "info"],
  ];

  it.each(pares)("--%s sobre --%s", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(AA);
  });
});

describe("contraste AA — texto do token sobre a própria tint", () => {
  // Regra do design system: texto colorido sobre tint do MESMO token usa /5
  // (primary/destructive) ou /10 (success/warning/info), sempre sobre o card
  // ou o fundo. Tints mais fortes derrubam o contraste e são proibidas.
  const casos: Array<[string, number, string]> = [
    ["primary", 0.05, "card"],
    ["primary", 0.05, "background"],
    ["destructive", 0.05, "card"],
    ["destructive", 0.05, "background"],
    ["success", 0.1, "card"],
    ["warning", 0.1, "card"],
    ["info", 0.1, "card"],
  ];

  it.each(casos)("--%s a %d sobre --%s", (name, alpha, base) => {
    const ratio = contrastOnTint(token(name), token(name), alpha, token(base));
    expect(ratio).toBeGreaterThanOrEqual(AA);
  });
});
