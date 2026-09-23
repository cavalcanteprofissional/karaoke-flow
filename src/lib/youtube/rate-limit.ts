/**
 * Rate limiting em memória (janela deslizante) para a rota de busca do YouTube.
 * Independente da cota da própria YouTube API (spec §13): impede que um único
 * participante esgote a cota do dia sozinho.
 * Limitado a um processo/serviço — para múltiplas instâncias, trocar por um
 * store compartilhado (ex: Redis) mantendo a mesma interface.
 */
export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export class MemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number
  ) {}

  consume(key: string, now: number = Date.now()): RateLimitDecision {
    const cutoff = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (list.length >= this.maxHits) {
      this.hits.set(key, list);
      const resetAt = list.length > 0 ? list[0] + this.windowMs : now + this.windowMs;
      return { allowed: false, remaining: 0, resetAt };
    }

    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return { allowed: true, remaining: this.maxHits - list.length, resetAt: now + this.windowMs };
  }

  prune(now: number = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, list] of this.hits) {
      if (list.every((t) => t <= cutoff)) this.hits.delete(key);
    }
  }

  clear(): void {
    this.hits.clear();
  }
}

export const SEARCH_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const SEARCH_RATE_LIMIT_MAX = 60;