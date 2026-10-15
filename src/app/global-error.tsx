"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
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
        <Button type="button" onClick={() => retry()}>
          Tentar de novo
        </Button>
      </body>
    </html>
  );
}
