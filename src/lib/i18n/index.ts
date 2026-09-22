export type Locale = "pt-BR" | "en" | "es";

export const LOCALES: Locale[] = ["pt-BR", "en", "es"];

export const DEFAULT_LOCALE: Locale = "pt-BR";

const SUPPORTED_ALIASES: Record<string, Locale> = {
  "pt-br": "pt-BR",
  pt: "pt-BR",
  en: "en",
  es: "es",
};

/**
 * Normaliza um código de idioma do navegador ("PT-br", "es-MX", "en-US"...)
 * para um Locale suportado, ou null se não houver correspondência. Dialetos
 * (en-*, es-*, pt-*) caem no Locale base; variantes de pt fora do pt-BR
 * (ex.: pt-PT) também usam pt-BR, que é o idioma padrão do produto.
 */
export function normalizeLocale(raw?: string): Locale | null {
  if (!raw) return null;
  const base = raw.trim().toLowerCase().split("-")[0];
  return SUPPORTED_ALIASES[base] ?? null;
}

/**
 * Detecta o idioma do dispositivo a partir de navigator.languages. Sempre
 * devolve um Locale válido (fallback: pt-BR), na ordem preferida do usuário.
 */
export function detectLocale(languages: string[]): Locale {
  for (const lang of languages) {
    const locale = normalizeLocale(lang);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
