type ErrorContext = Record<string, unknown>;

/**
 * Ponto único de captura de erro no client/server. Hoje emite um log
 * estruturado (com o `digest` do App Router para correlacionar com o log do
 * servidor); um provedor de error tracking (Sentry/OTel) entra aqui sem tocar
 * nas telas. `context` nunca deve conter segredo.
 */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const digest = (err as { digest?: string }).digest;

  console.error(
    "[observability]",
    JSON.stringify({ level: "error", message: err.message, digest, ...context })
  );
}
