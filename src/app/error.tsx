"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { captureError } from "@/lib/observability";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    captureError(error, { boundary: "route" });
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-muted-foreground text-sm font-medium">Algo deu errado</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Não foi possível carregar esta tela
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Foi uma falha inesperada. Tente de novo — se continuar, avise o responsável pelo
        bar.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs">
          Código do erro: {error.digest}
        </p>
      ) : null}
      <Button onClick={() => retry()}>Tentar de novo</Button>
    </main>
  );
}
