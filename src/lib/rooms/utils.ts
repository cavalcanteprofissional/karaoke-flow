/** Normaliza um código de sala digitado: corta espaços e força maiúsculas. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/**
 * Extrai o código de sala de um texto lido em QR.
 * Aceita a URL de entrada (`/entrar?code=KARAOK`) ou o código puro de 6 chars.
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
