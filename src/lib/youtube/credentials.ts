import { getAppAccessToken } from "@/lib/youtube/app-oauth";

export type ApiKeySource = "room" | "host" | "platform" | "app" | "dev";

export type ResolvedApiKey = {
  key: string;
  source: ApiKeySource;
};

/**
 * Resolve a credencial da YouTube Data API (spec §12/§13, Fase 8f).
 *
 * A ordem é a mesma desde a Fase 4, mas os **degraus de terceiro** pararam de
 * ser alcançáveis por acidente:
 *
 *  1. chave manual do bar (`rooms.youtube_api_key`) — `own_only`, sempre;
 *  2. token OAuth do HOST (conta Google do dono, via `youtube_oauth_tokens`);
 *  3. chave do POOL DA PLATAFORMA — só quando a política do bar é
 *     `platform_pool` (migration `20261005000043`), e nunca junto de 1 e 2;
 *  4. token OAuth do APP — só para conta `dev`;
 *  5. chave de desenvolvimento (`YOUTUBE_API_KEY`) — **só para conta `dev`**.
 *
 * POR QUE OS DOIS ÚLTIMOS VIRARAM CONDICIONAIS (a correção da Fase 8f):
 * antes, os degraus 4 e 5 eram alcançados por qualquer sala que não tivesse
 * nada nos três primeiros, porque a única condição era "a env existe". Na
 * prática, qualquer bar que aparecesse no produto passou a gastar a cota
 * pessoal do dono — sem ele saber e sem poder recusar. O sintoma foi a busca
 * respondendo 502 na Vercel para um dono que nunca configurou nada, com
 * mensagem genérica que escondia a causa (`toFriendlyYouTubeError` jogava fora
 * o `reason` do Google).
 *
 * O gate é `isDev`, e NÃO `NODE_ENV`: a mesma conta `dev` (o login GitHub do
 * dono) passa a usar a chave dele tanto no dev local quanto no deploy, e nenhum
 * outro usuário — nem anônimo, nem outro host — alcança o degrau. O papel vive
 * no banco (`dev_accounts`, migration `20260930000034`), então não é uma env
 * que alguém esquece de tirar da Vercel.
 *
 * Retorna null quando não há credencial disponível para ESTA sala — e a
 * distinção importa: "o bar não trouxe chave" (`own_only`) e "o bar pediu
 * pool, mas o pool não está ativo" são recites diferentes.
 */
export async function resolveYouTubeApiKey(params: {
  roomKey: string | null;
  hostToken?: string | null;
  /** Só usado quando a política do bar é `platform_pool`. */
  platformKey?: string | null;
  /** `is_dev()` do usuário da sessão. Ausente = falso (falha fechada). */
  isDev?: boolean;
  appToken?: () => Promise<string | null>;
  devApiKey?: string | null;
}): Promise<ResolvedApiKey | null> {
  const { roomKey, hostToken, platformKey, isDev, appToken, devApiKey } = params;

  const trimmedRoom = roomKey?.trim();
  if (trimmedRoom) return { key: trimmedRoom, source: "room" };

  const trimmedHost = hostToken?.trim();
  if (trimmedHost) return { key: trimmedHost, source: "host" };

  const trimmedPlatform = platformKey?.trim();
  if (trimmedPlatform) return { key: trimmedPlatform, source: "platform" };

  // A partir daqui a credencial é do dono do produto, não do bar — então o portão
  // é o papel, e o papel é perguntado ao banco.
  if (!isDev) return null;

  if (appToken) {
    const token = await appToken();
    if (token) return { key: token, source: "app" };
  }

  const trimmedDev = devApiKey?.trim();
  if (trimmedDev) return { key: trimmedDev, source: "dev" };

  return null;
}

export function resolveDevApiKeyFromEnv(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

export function defaultAppTokenProvider(): () => Promise<string | null> {
  return () => getAppAccessToken();
}