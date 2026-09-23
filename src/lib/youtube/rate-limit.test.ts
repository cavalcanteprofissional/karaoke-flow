import { describe, expect, it } from "vitest";

import { MemoryRateLimiter } from "./rate-limit";

describe("MemoryRateLimiter", () => {
  it("permite até o limite dentro da janela", () => {
    const limiter = new MemoryRateLimiter(60_000, 3);
    expect(limiter.consume("user", 1000).allowed).toBe(true);
    expect(limiter.consume("user", 2000).allowed).toBe(true);
    expect(limiter.consume("user", 3000).allowed).toBe(true);
    const blocked = limiter.consume("user", 4000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("janelas são independentes por chave", () => {
    const limiter = new MemoryRateLimiter(60_000, 2);
    expect(limiter.consume("a", 1000).allowed).toBe(true);
    expect(limiter.consume("a", 1000).allowed).toBe(true);
    expect(limiter.consume("a", 1000).allowed).toBe(false);
    expect(limiter.consume("b", 1000).allowed).toBe(true);
  });

  it("expira após a janela (deslizante)", () => {
    const limiter = new MemoryRateLimiter(60_000, 2);
    limiter.consume("user", 1000);
    limiter.consume("user", 2000);
    expect(limiter.consume("user", 3000).allowed).toBe(false);
    // janela de 60s: o hit de 1000 expira agora
    expect(limiter.consume("user", 61_001).allowed).toBe(true);
  });

  it("reporta resetAt na janela do hit mais antigo", () => {
    const limiter = new MemoryRateLimiter(60_000, 1);
    limiter.consume("user", 1000);
    const blocked = limiter.consume("user", 30_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetAt).toBe(61_000);
  });

  it("prune remove chaves expiradas", () => {
    const limiter = new MemoryRateLimiter(60_000, 10);
    limiter.consume("velha", 1000);
    limiter.consume("nova", 1000);
    limiter.consume("nova", 95_000);
    limiter.prune(90_000);
    expect(limiter.consume("velha", 91_000).allowed).toBe(true);
    expect(limiter.consume("nova", 91_000).allowed).toBe(true);
  });
});