/**
 * Utilitários de contraste WCAG para os tokens do design system.
 *
 * O design system promete contraste **AA** no texto (design-system §1.3). Como
 * os tokens vivem em `src/app/globals.css` e podem ser repintados a qualquer
 * momento, o `contrast.test.ts` lê o CSS de verdade e recalcula os pares — se
 * alguém escurecer um token abaixo de AA, a suíte quebra.
 *
 * A conversão é oklch → oklab → sRGB linear (Björn Ottosson) e a razão é a da
 * WCAG 2.1 (luminância relativa + 0.05).
 */

export type Oklch = {
  l: number;
  c: number;
  h: number;
  /** 0..1; 1 = opaco. Usado em tints (`oklch(1 0 0 / 12%)`). */
  alpha: number;
};

const OKLCH_RE =
  /--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%)?\s*\)/g;

/** Extrai todos os tokens `--nome: oklch(...)` de um bloco do CSS. */
export function parseOklchTokens(block: string): Record<string, Oklch> {
  const out: Record<string, Oklch> = {};
  for (const match of block.matchAll(OKLCH_RE)) {
    const [, name, l, c, h, alphaPercent] = match;
    out[name] = {
      l: Number(l),
      c: Number(c),
      h: Number(h),
      alpha: alphaPercent === undefined ? 1 : Number(alphaPercent) / 100,
    };
  }
  return out;
}

/** Recorta o conteúdo de um seletor simples (`:root` ou `.dark`). */
export function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Seletor não encontrado no CSS: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) throw new Error(`Bloco malformado: ${selector}`);
  return css.slice(open + 1, close);
}

/** oklch → RGB linear (sRGB primárias), sem clamp. */
export function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

/** Luminância relativa da WCAG a partir de um RGB linear. */
export function relativeLuminance(rgb: [number, number, number]): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return 0.2126 * clamp(rgb[0]) + 0.7152 * clamp(rgb[1]) + 0.0722 * clamp(rgb[2]);
}

function ratioBetween(y1: number, y2: number): number {
  const [hi, lo] = y1 > y2 ? [y1, y2] : [y2, y1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Razão de contraste WCAG entre duas cores opacas. */
export function contrastRatio(fg: Oklch, bg: Oklch): number {
  return ratioBetween(
    relativeLuminance(oklchToLinearRgb(fg)),
    relativeLuminance(oklchToLinearRgb(bg))
  );
}

/** Composição de `top` (com alpha) sobre `base`, em luz linear. */
export function composite(
  top: Oklch,
  base: Oklch,
  alpha: number
): [number, number, number] {
  const t = oklchToLinearRgb(top);
  const b = oklchToLinearRgb(base);
  return [
    t[0] * alpha + b[0] * (1 - alpha),
    t[1] * alpha + b[1] * (1 - alpha),
    t[2] * alpha + b[2] * (1 - alpha),
  ];
}

/**
 * Razão de contraste de um texto sobre um fundo **tingido**: o fundo é o token
 * `tint` aplicado com `alpha` sobre `base` (ex.: `bg-warning/10` sobre o card).
 */
export function contrastOnTint(
  text: Oklch,
  tint: Oklch,
  alpha: number,
  base: Oklch
): number {
  const bg = composite(tint, base, alpha);
  return ratioBetween(relativeLuminance(oklchToLinearRgb(text)), relativeLuminance(bg));
}
