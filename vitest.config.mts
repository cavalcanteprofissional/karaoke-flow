import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/rooms/**", "src/stores/**"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "src/test/**"],
      reporter: ["text", "html"],
      // Ratchet: trava regressão abaixo do patamar atual. Suba com o tempo
      // (meta: 70% em src/lib/rooms) — ver docs/engenharia/melhorias.md (M5).
      thresholds: {
        statements: 55,
        branches: 55,
        functions: 60,
        lines: 55,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
