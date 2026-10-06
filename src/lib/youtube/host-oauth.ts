import { refreshHostAccessToken } from "@/lib/youtube/app-oauth";

export type HostTokenStore = {
  getRefreshToken: (hostId: string) => Promise<string | null>;
};

/**
 * Margem de expiração do cache. O access token do Google vive ~1h; guardar com
 * folga evita usar um token que expira no meio do `search.list`.
 */
const TOKEN_RESERVE_SECONDS = 60 * 5;

/**
 * Cache de access token por host, EM MEMÓRIA da instância.
 *
 * POR QUE ESTE CACHE EXISTE (Fase 8f): sem ele, cada busca de um host que
 * conectou a conta batia em `oauth2.googleapis.com/token` com o refresh_token —
 * um round-trip extra por busca, dentro da janela de rate limit do Google, para
 * obter exatamente o mesmo token. Com 50–100 pessoas no mesmo bar, isso é uma
 * enxurrada de chamadas de token desnecessária.
 *
 * O que ele NÃO resolve, e é importante não prometer: em serverless cada
 * lambda tem sua própria memória, então o cache vale por instância. O
 * `MemoryRateLimiter` e o cache do token do app têm a mesma limitação e a
 * correção definitiva (estado distribuído em Railway) está no plano de escala,
 * não aqui. O ganho imediato é real na mesma instância — e no dev local.
 *
 * Nunca guardar o `refresh_token` aqui: a chave do cache é o `hostId`, e o valor
 * é só o access token de curta duração.
 */
const cache = new Map<string, { value: string; expiresAt: number }>();

/** Só para teste: esvazia o cache entre casos. */
export function clearCachedHostTokens(): void {
  cache.clear();
}

/**
 * In-flight por host: duas buscas simultâneas do mesmo host não podem gerar
 * dois refreshes. Sem isto, o cache acima ainda permitiria um stampede no
 * primeiro acesso (ou logo após a expiração), que é justamente o pico de
 * tráfego que mais pesa no endpoint de token.
 */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Geração de invalidação por host.
 *
 * Existe para um caso que os testes acharam: invalidar enquanto um refresh está
 * em andamento **não** bastava, porque o refresh resolvia depois e gravava o
 * token revogado no cache de novo. Como o `inFlight` é assíncrono e a escrita
 * no cache acontece do lado do refresh, o `invalidate` não consegue simplesmente
 * apagar o que ainda não foi escrito. Cada host tem um contador; o refresh
 * só grava no cache se a geração não mudou desde que ele começou.
 */
const generations = new Map<string, number>();

/**
 * Invalida o token em cache de UM host.
 *
 * POR QUE EXISTE (Fase 8f): o cache tem 55 minutos de validade e nunca era
 * limpo, então um host que **desconectasse** a conta do YouTube continuava com
 * o token antigo em toda busca até a expiração. Pior: o callback de reconexão
 * grava um `refresh_token` novo, e a instância que já tinha o host em cache
 * ignoraria a troca por até 55 minutos.
 *
 * Chamar em **todo** caminho que escreve em `youtube_oauth_tokens` para um host
 * — o callback (`upsert`) e a action de desconectar (`delete`). Sem isso, o
 * cache ficaria guardando um token que o dono acabou de revogar.
 *
 * Limite honesto: isto vale **por instância**, como o cache. Numa desconexão,
 * instâncias que não estavam warm não são notificadas, e podem usar o token
 * antigo até a expiração. Fechar isso exige estado distribuído (o plano de
 * escala com Railway) ou versionar a chave do cache por `updated_at` da linha — o
 * que custa uma leitura da tabela a cada busca, e por isso não foi escolhido.
 */
export function invalidateCachedHostToken(hostId: string): void {
  cache.delete(hostId);
  inFlight.delete(hostId);
  generations.set(hostId, (generations.get(hostId) ?? 0) + 1);
}

/**
 * Obtém um access token OAuth do host para a YouTube Data API, refinando o
 * refresh_token armazenado em `youtube_oauth_tokens` (apenas service role).
 * Retorna null quando o host nunca conectou a conta.
 */
export async function getHostAccessToken(params: {
  hostId: string;
  store: HostTokenStore;
  refresher?: (refreshToken: string) => Promise<string | null>;
}): Promise<string | null> {
  const { hostId, store } = params;

  const cached = cache.get(hostId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = inFlight.get(hostId);
  if (pending) return pending;

  const generationAtStart = generations.get(hostId) ?? 0;

  const request = (async () => {
    const refreshToken = await store.getRefreshToken(hostId);
    if (!refreshToken) return null;
    const refresher = params.refresher ?? refreshHostAccessToken;
    const token = await refresher(refreshToken);
    if (!token) return null;
    // Só grava se ninguém invalidou este host enquanto o refresh corria. Sem
    // esta comparação, desconectar durante um refresh devolveria o token
    // revogado ao cache — e a invalidação pareceria não ter funcionado.
    if ((generations.get(hostId) ?? 0) === generationAtStart) {
      cache.set(hostId, {
        value: token,
        expiresAt: Date.now() + (3600 - TOKEN_RESERVE_SECONDS) * 1000,
      });
    }
    return token;
  })();

  inFlight.set(hostId, request);
  try {
    return await request;
  } finally {
    // Sai no `finally` para que uma falha de rede não deixe o host preso no
    // in-flight: a próxima busca precisa poder tentar de novo.
    inFlight.delete(hostId);
  }
}