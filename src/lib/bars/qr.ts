const CODE_PATTERN = /^[A-Z0-9]{6}$/;

/** Resultado do parse de um token de entrada (texto digitado ou QR). */
export type EntryToken = {
  bar?: string;
  mesa?: number;
  roomCode?: string;
};

function isCode(value: string): value is string {
  return CODE_PATTERN.test(value);
}

/**
 * Interpreta o que o usuário trouxe para entrar:
 *  - texto puro de 6 chars  → código (pode ser bar OU sala; a RPC resolve);
 *  - URL `/entrar`          → lê `bar`, `mesa` e `code`;
 *  - qualquer outra URL     → ignora.
 */
export function parseEntryToken(text: string): EntryToken | null {
  const trimmed = text.trim();
  const normalized = trimmed.toUpperCase();
  if (isCode(normalized)) return { roomCode: normalized };

  try {
    const url = new URL(trimmed);
    if (!url.pathname.endsWith("/entrar")) return null;

    const bar = url.searchParams.get("bar");
    const code = url.searchParams.get("code");
    const mesaRaw = url.searchParams.get("mesa");
    const mesa = mesaRaw ? Number(mesaRaw) : undefined;

    if (bar) {
      if (!isCode(bar)) return null;
      const token: EntryToken = { bar };
      if (Number.isInteger(mesa) && mesa! >= 1 && mesa! <= 999) token.mesa = mesa;
      return token;
    }
    if (code && isCode(code)) {
      const token: EntryToken = { roomCode: code };
      if (Number.isInteger(mesa) && mesa! >= 1 && mesa! <= 999) token.mesa = mesa;
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Token → rota de entrada. Barras/mesas têm parâmetros próprios; código de
 * sala (QR legado) mantém `?code=`.
 */
export function entryRoute(token: EntryToken): string {
  const base = "/entrar";
  const params = new URLSearchParams();
  if (token.bar) {
    params.set("bar", token.bar);
    if (token.mesa) params.set("mesa", String(token.mesa));
  } else if (token.roomCode) {
    params.set("code", token.roomCode);
    if (token.mesa) params.set("mesa", String(token.mesa));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** URL do QR do bar (leva à preview do bar para escolher a mesa). */
export function barJoinUrl(barCode: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/entrar?bar=${barCode}`;
}

/**
 * Extrai o token de entrada de um texto lido em QR de bar/mesa: devolve a
 * rota canônica (`/entrar?bar=...&mesa=N`) ou `null` se não for reconhecido.
 */
export function extractEntryToken(text: string): string | null {
  const token = parseEntryToken(text);
  if (!token) return null;
  return entryRoute(token);
}

/** URL do QR de uma mesa (entrada direta na sala com a mesa pré-selecionada). */
export function mesaJoinUrl(barCode: string, mesa: number): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/entrar?bar=${barCode}&mesa=${mesa}`;
}