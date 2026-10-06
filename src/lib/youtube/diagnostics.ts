import { classifyYouTubeError } from "@/lib/youtube/errors";
import type { YouTubeAuthMode } from "@/lib/youtube/types";
import { YouTubeApiError } from "@/lib/youtube/errors";

/**
 * Diagnóstico de credencial do YouTube (Fase 8f).
 *
 * POR QUE ISTO EXISTE: o defeito reportado foi uma mensagem genérica na Vercel.
 * Checagem de "a env existe" não distingue chave inválida, chave com restrição
 * de IP, API não habilitada e cota estourada — e as quatro têm consertos
 * diferentes, três delas no Google Cloud. O diagnóstico faz a chamada de
 * verdade e devolve o `reason` do Google, classificado.
 *
 * O QUE NUNCA SAI DAQUI, em nenhum campo, em nenhum código:
 *   - a chave (nem prefixo, nem os últimos dígitos);
 *   - o access token ou o refresh token;
 *   - o corpo bruto da resposta do Google — que ecoa a URL com `?key=` no
 *     `message` de alguns erros, e por isso nunca é repassado;
 *   - o id do projeto de onde a chave veio.
 *
 * O que sai: qual fonte de credencial foi usada, se há alguma, o código
 * classificado, o `reason` cru do Google e o passo escrito para o humano. É
 * suficiente para diagnosticar e insuficiente para roubar.
 */

export type DiagnosticSource =
  | "room"
  | "host"
  | "platform"
  | "app"
  | "dev"
  | "none";

export type YouTubeDiagnostic = {
  /** `false` = a chamada foi feita e o YouTube aceitou. */
  ok: boolean;
  /** De onde veio a credencial. `none` = nenhuma estava disponível. */
  source: DiagnosticSource;
  /** Código do produto (`classifyYouTubeError`). `null` quando nem houve erro. */
  code: string | null;
  /** `reason` cru do Google, para casar com a documentação dele. */
  googleReason: string | null;
  /** Passo acionável, em português. */
  hint: string | null;
  /** HTTP status devolvido pelo YouTube, quando houve resposta. */
  httpStatus: number | null;
  /** Latência do probe em ms — distingue "recusou" de "não respondeu". */
  elapsedMs: number | null;
};

/**
 * Chamada mínima e barata de verificação.
 *
 * `part=snippet` + `maxResults=1` + `q` fixo: o `search.list` custa 100 unidades
 * de cota, então o probe não pode ser uma busca real. O `q` é um termo genérico
 * (o próprio nome da API) para o resultado não depender do conteúdo do canal de
 * quem conecta — o objetivo é verificar a CREDENCIAL, não o conteúdo.
 */
const PROBE_QUERY = "karaoke";
const PROBE_MAX_RESULTS = 1;

export async function probeYouTubeCredential(params: {
  credential: { key: string; source: DiagnosticSource } | null;
  fetcher?: typeof fetch;
  now?: () => number;
}): Promise<YouTubeDiagnostic> {
  const fetcher = params.fetcher ?? fetch;
  const now = params.now ?? (() => Date.now());

  if (!params.credential) {
    return {
      ok: false,
      source: "none",
      code: "CREDENTIAL_NOT_CONFIGURED",
      googleReason: null,
      hint: "Nenhuma credencial está configurada para este bar. O dono precisa salvar uma chave da YouTube Data API v3.",
      httpStatus: null,
      elapsedMs: null,
    };
  }

  const { key, source } = params.credential;
  const authMode: YouTubeAuthMode = source === "app" || source === "host" ? "bearer" : "key";

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", PROBE_QUERY);
  url.searchParams.set("maxResults", String(PROBE_MAX_RESULTS));
  if (authMode === "key") url.searchParams.set("key", key);

  const startedAt = now();
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      // Sem `Referer`, de propósito: é assim que a busca real roda, e é por isso
      // que uma chave com restrição de origem falha aqui do mesmo jeito que
      // falha em produção. Um probe que mandasse Referer dariaria um "verde"
      // falso para a configuração que está quebrando o app.
      headers: authMode === "bearer" ? { Authorization: `Bearer ${key}` } : {},
    });
  } catch {
    return {
      ok: false,
      source,
      code: "YOUTUBE_UNREACHABLE",
      googleReason: null,
      hint: "O servidor não conseguiu alcançar o Google. Verifique a saída de rede do deploy.",
      httpStatus: null,
      elapsedMs: now() - startedAt,
    };
  }

  const elapsedMs = now() - startedAt;

  if (response.ok) {
    return {
      ok: true,
      source,
      code: null,
      googleReason: null,
      hint: null,
      httpStatus: response.status,
      elapsedMs,
    };
  }

  let reason: string | null = null;
  try {
    const payload = (await response.json()) as {
      error?: { errors?: Array<{ reason?: string }>; message?: string };
    };
    reason = payload?.error?.errors?.[0]?.reason ?? null;
  } catch {
    // Sem corpo JSON: o probe só pode dizer o status.
    reason = null;
  }

  const classified = classifyYouTubeError({
    reason,
    // A mensagem do Google entra na classificação e NÃO sai daqui: ela pode
    // ecoar a URL com `?key=`. Um `reason` ausente com corpo não-JSON cai em
    // `UNKNOWN`, que é a resposta honesta — melhor que um palpite.
    message: "",
    httpStatus: response.status,
    retryAfterHeader: response.headers.get("retry-after"),
  });

  return {
    ok: false,
    source,
    code: classified.code,
    googleReason: reason,
    hint: classified.hint,
    httpStatus: response.status,
    elapsedMs,
  };
}

/**
 * Padrões de segredo que podem aparecer numa URL ou numa exceção. A lista é
 * deliberadamente ampla: o custo de um falso positivo é a mensagem sumir do
 * diagnóstico, e o custo de um falso negativo é a chave no histórico de log.
 */
const SECRET_PATTERNS: RegExp[] = [
  // Chave da API do Google (`?key=AIza…`, e o prefixo solto).
  /AIza[0-9A-Za-z\-_]{10,}/,
  // Parâmetros de credencial em qualquer posição — a exceção costuma repetir o
  // par sem o `?` ou `&` do começo da query ("invalid_grant: refresh_token=…").
  /\b(api_?key|access_token|refresh_token|id_token|client_secret|access_key|token|secret)\s*=\s*\S+/i,
  // Parâmetros de query que são secretos só quando precedidos de `?`/`&`
  // (`code` sozinho seria falso positivo em qualquer "error code=403").
  /[?&](key|code)=/i,
  // Prefixos dos tokens do Google, mesmo sem o nome do parâmetro.
  /\b(ya29\.|1\/\/0)[0-9A-Za-z\-_./]{6,}/,
  // `Bearer …` / `Basic …`.
  /\b(bearer|basic)\s+[0-9A-Za-z\-._~+/]{8,}=*/i,
  // JWT do Supabase (`eyJ…`, três segmentos separados por ponto).
  /\beyJ[0-9A-Za-z\-_]{10,}\.[0-9A-Za-z\-_]{10,}\./,
  // Senha de service role do Supabase (`sb_secret_…` na rotação nova).
  /\bsb_secret_[0-9A-Za-z\-_]{10,}/,
  // Chave anon/publishable: `sb_publishable_…` e o JWK legacy `eyJ…` já coberto.
  /\bsb_publishable_[0-9A-Za-z\-_]{10,}/,
];

/**
 * Rótulo genérico para quando a mensagem era boa mas não pôde ser publicada
 * crua. Melhor um código honesto do que um texto que muda de forma conforme a
 * biblioteca de `fetch` decide formatar a URL.
 */
const REDACTED = "[omitido: a mensagem continha um segredo]";

/**
 * Sanidade do erro antes de ele virar log ou resposta.
 *
 * Existe porque `YouTubeApiError.message` vem do Google e a `reason` também: os
 * dois podem conter o id do projeto e, em alguns casos, a URL com `?key=`.
 * Esta função é a fronteira que garante que a string registrada é a NOSSA
 * (código + passo), não a do Google. Chame sempre que for persistir o motivo.
 *
 * E porque o **outro** lado também precisa de fronteira: uma exceção que não é
 * `YouTubeApiError` (o `fetch` do token de OAuth, o cliente do Supabase, o
 * driver) não tem nenhuma garantia de que a própria mensagem não citará a URL
 * montada com a chave. Antes esta função só filtrava o caso do Google e deixava
 * passar o resto — e o endpoint de diagnóstico devolvia `error.message` cru.
 * Agora **toda** mensagem passa por `SECRET_PATTERNS`.
 */
export function safeDiagnosticDetail(error: unknown): {
  code: string | null;
  googleReason: string | null;
  thrownMessage: string | null;
  /** `true` quando havia mensagem e ela foi descartada por conter segredo. */
  redacted: boolean;
} {
  if (error instanceof YouTubeApiError) {
    return {
      code: null,
      googleReason: error.reason,
      // Deliberadamente NÃO devolvida: é o texto do Google, que pode ecoar a
      // URL com a chave no parâmetro `key`.
      thrownMessage: null,
      redacted: false,
    };
  }
  if (error instanceof Error) {
    const message = error.message;
    if (SECRET_PATTERNS.some((pattern) => pattern.test(message))) {
      return { code: null, googleReason: null, thrownMessage: REDACTED, redacted: true };
    }
    return { code: null, googleReason: null, thrownMessage: message, redacted: false };
  }
  return { code: null, googleReason: null, thrownMessage: null, redacted: false };
}