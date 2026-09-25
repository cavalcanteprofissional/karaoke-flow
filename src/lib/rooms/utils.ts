/**
 * Código de entrada configurável do karaokê: 3–12 letras/números em maiúsculas
 * (sem acentos e sem espaços). O default é derivado do nome do bar; fallback
 * "KARAOKE"+sufixo iterativo quando não há nome suficiente (único_room_code no banco).
 */
const ROOM_CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

/** Normaliza um código de sala digitado: corta espaços e força maiúsculas. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/**
 * Deriva um código legível a partir do nome do bar: maiúsculas, sem acentos e
 * espaços, truncado em 12 chars. Retorna null quando não sobra nada válido
 * (nome curto/sem letras) — nesse caso o banco usa "KARAOKE"+sufixo iterativo.
 */
export function deriveRoomCodeFromName(name: string): string | null {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 3 ? normalized.slice(0, 12) : null;
}

/**
 * Extrai o código de sala de um texto lido em QR.
 * Aceita a URL de entrada (`/entrar?code=KARAOKE`) ou o código puro.
 */
export function extractRoomCodeFromQr(text: string): string | null {
  const trimmed = text.trim();
  if (ROOM_CODE_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code") ?? "";
    return ROOM_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** URL que o QR da sala codifica (join em 1 toque). */
export function roomJoinUrl(code: string, appUrl?: string): string {
  const base = (
    appUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}/entrar?code=${code}`;
}
