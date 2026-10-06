import type { YouTubeApiErrorPayload } from "@/lib/youtube/types";

export class YouTubeApiError extends Error {
  readonly code: number | null;
  readonly reason: string | null;
  /**
   * `Retry-After` do HTTP quando o Google manda (segundos). Guardado no erro em
   * vez de só no classificador porque o header está na `Response` — e a camada
   * que a teve foi `requestJson`, que só enxerga o erro. Sem propagar, um 429
   * real do YouTube vira 502 sem `Retry-After` e o cliente faz retry cego.
   */
  readonly retryAfterHeader: string | null;

  constructor(
    message: string,
    payload: YouTubeApiErrorPayload,
    httpStatus: number | null,
    retryAfterHeader: string | null = null
  ) {
    super(message);
    this.name = "YouTubeApiError";
    this.code = payload.error?.code ?? httpStatus;
    this.reason = payload.error?.errors?.[0]?.reason ?? payload.error?.message ?? null;
    this.retryAfterHeader = retryAfterHeader;
  }
}

/**
 * O que a rota responde quando o Google recusa uma busca, em código estável.
 *
 * POR QUE ISTO EXISTE (Fase 8f): a mensagem que o participante via era
 * `"Não foi possível buscar no YouTube agora. Tente de novo em instantes."` —
 * o `return` final de `toFriendlyYouTubeError`, alcançado sempre que a causa
 * real não casava com nenhum dos dois regex de cota/chave. O `reason` que o
 * Google manda (campo que a classe acima já guardava e **ninguém lia**) era
 * descartado, e o mesmo texto cobria quatro causas que exigem ações diferentes
 * do dono do bar: chave inválida, chave com restrição de origem, API não
 * habilitada no projeto e cota estourada.
 *
 * O `code` é o que a tela usa para decidir o que falar. A distinção que mais
 * importa no produto é `KEY_RESTRICTED`: a busca roda no servidor e **não manda
 * `Referer`**, então uma chave criada com "restrições de aplicativo" ou
 * "restrições de endereço IP" no Google Cloud funciona na máquina do dono e
 * falha no deploy — exatamente o defeito que só apareceu na Vercel.
 */
export type YouTubeErrorCode =
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED_BY_YOUTUBE"
  | "KEY_INVALID"
  | "KEY_RESTRICTED"
  | "API_NOT_ENABLED"
  | "SCOPES_INSUFFICIENT"
  | "YOUTUBE_UNREACHABLE"
  | "UNKNOWN";

export type YouTubeErrorClassification = {
  code: YouTubeErrorCode;
  /** Texto para o participante. Curto: quem lê está no meio de um bar. */
  friendly: string;
  /**
   * O que o DONO do bar precisa fazer, quando há ação. Vai no corpo da resposta
   * para a tela conseguir mostrar um link para as configurações da sala; nunca
   * contém chave, id de projeto ou token.
   */
  hint: string | null;
  status: 429 | 502;
  /** Só quando o Google manda (`Retry-After` do próprio HTTP é outra fonte). */
  retryAfterSeconds: number | null;
};

/**
 * Rótulos do `reason` do Google para código do produto.
 *
 * As chaves são minúsculas porque o `reason` vem como `camelCase` do Google e a
 * comparação precisa casar tanto "quotaExceeded" quanto "quotaexceeded" (a
 * mensagem textual às vezes traz a variante). A ordem importa: `dailyLimitExceeded`
 * contém "limit", e `rateLimitExceeded` também — a distinção real é se cita
 * "daily".
 */
const REASON_CODES: Array<{
  test: RegExp;
  code: YouTubeErrorCode;
  friendly: string;
  hint: string | null;
  status: 429 | 502;
}> = [
  {
    test: /dailylimitexceeded|quotaexceeded|quota/i,
    code: "QUOTA_EXHAUSTED",
    friendly: "A cota de buscas no YouTube deste bar acabou por hoje. Tente de novo amanhã.",
    hint: "A cota é do projeto da chave configurada. Uma chave nova, ou o pool da plataforma, resolve.",
    status: 502,
  },
  {
    test: /ratelimitexceeded|userratelimitexceeded/i,
    code: "RATE_LIMITED_BY_YOUTUBE",
    friendly: "O YouTube pediu para a busca esperar um instante.",
    hint: null,
    status: 429,
  },
  {
    // A busca é server-side: não existe Referer para casar com restrição de
    // origem, e o IP de saída da Vercel não é o da máquina do dono.
    test: /iprefererblocked|refererrestriction/i,
    code: "KEY_RESTRICTED",
    friendly: "A chave do YouTube deste bar tem restrição de origem e a busca não consegue usar.",
    hint: "No Google Cloud, edite a chave e deixe as restrições de aplicação e de endereço IP sem restrição: a busca roda no servidor e não manda Referer.",
    status: 502,
  },
  {
    test: /accessnotconfigured|apinotenabled|youtube.*not.*enabled/i,
    code: "API_NOT_ENABLED",
    friendly: "A chave do YouTube deste bar aponta para um projeto sem a busca ativada.",
    hint: "No Google Cloud, ative a YouTube Data API v3 no projeto da chave e espere alguns minutos.",
    status: 502,
  },
  {
    test: /insufficient.*scope|accessnotgranted|forbidden|unauthorized/i,
    code: "SCOPES_INSUFFICIENT",
    friendly: "A conta conectada ao YouTube não tem permissão de leitura.",
    hint: "Reconecte a conta do YouTube e aceite todas as permissões pedidas.",
    status: 502,
  },
  {
    // O Google escreve a mesma condição de três formas: `keyInvalid` (reason),
    // "API key not valid" e "The API key is not valid" (mensagem). O `.*`
    // cobre o espaço e o "not" fora de ordem, que um literal não pegaria.
    test: /keyinvalid|api\s*key.*(not\s*valid|invalid)|invalid.*key/i,
    code: "KEY_INVALID",
    friendly: "A chave do YouTube deste bar não é válida.",
    hint: "Confira a chave salva nas configurações da sala, ou crie outra no Google Cloud.",
    status: 502,
  },
];

function classificationFor(
  code: YouTubeErrorCode,
  friendly: string,
  hint: string | null,
  status: 429 | 502
): YouTubeErrorClassification {
  return { code, friendly, hint, status, retryAfterSeconds: null };
}

/**
 * Classifica a recusa do Google a partir do `reason` + mensagem.
 *
 * Por que o `reason` primeiro: a mensagem em português/inglês do Google muda
 * ("API key not valid" vs "The API key is not valid"), mas o `reason` da
 * `errors[0]` é estável e documentado. A mensagem fica como rede de segurança
 * para quando o `reason` não vem (erro sem corpo JSON, ou proxy no meio).
 */
export function classifyYouTubeError(input: {
  reason: string | null;
  message: string;
  httpStatus: number | null;
  retryAfterHeader?: string | null;
}): YouTubeErrorClassification {
  const haystack = `${input.reason ?? ""} ${input.message}`.toLowerCase();

  // Falha de rede: `search.ts` já traduz o erro de fetch para esta mensagem
  // (`YouTubeApiError` com payload vazio), então o `reason` é null aqui.
  if (input.reason === null && /falha de rede|fail(ed)? to fetch|econnrefused|enotfound|etimedout/i.test(haystack)) {
    return classificationFor(
      "YOUTUBE_UNREACHABLE",
      "O servidor não conseguiu falar com o YouTube agora.",
      null,
      502
    );
  }

  for (const entry of REASON_CODES) {
    if (entry.test.test(haystack)) {
      return classificationFor(entry.code, entry.friendly, entry.hint, entry.status);
    }
  }

  const retryAfter = parseRetryAfter(input.retryAfterHeader);
  if (input.httpStatus === 429 || retryAfter !== null) {
    return { ...classificationFor("RATE_LIMITED_BY_YOUTUBE", "O YouTube pediu para a busca esperar um instante.", null, 429), retryAfterSeconds: retryAfter };
  }

  /**
   * O `UNKNOWN` é o ponto que fecha o defeito da Fase 8f: a resposta nomeia a
   * causa em vez de devolver um texto genérico igual para tudo. `detail` vai no
   * log do servidor (`diagnostics.ts`), e o corpo da resposta carrega o código
   * para a tela poder dizer "isto é do servidor, não é a sua chave" — que é a
   * diferença entre o dono corrigir a própria configuração e o dono abrir
   * chamado achando que a chave dele está quebrada.
   */
  return classificationFor(
    "UNKNOWN",
    "O YouTube recusou a busca e não deu para dizer por quê.",
    null,
    502
  );
}

function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}