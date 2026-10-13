"use client";

import { useEffect } from "react";

import { captureError } from "@/lib/observability";

import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    captureError(error, { boundary: "global" });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center font-sans antialiased">
        <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          A aplicação encontrou uma falha inesperada. Tente de novo ou recarregue a
          página.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="bg-primary text-primary-foreground rounded-xl px-4 py-3 text-base font-medium"
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
