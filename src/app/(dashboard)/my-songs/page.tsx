"use client";

import { useUser } from "@/hooks/useUser";
import { Music2 } from "lucide-react";

export default function MySongsPage() {
  const user = useUser();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Minhas Músicas</h1>
        <p className="text-muted-foreground">
          Acompanhe o status das músicas que você solicitou.
        </p>
      </div>

      <div className="border rounded-lg p-12 text-center">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-muted rounded-full">
            <Music2 className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        <h2 className="text-xl font-semibold mb-2">Nenhuma música solicitada</h2>
        <p className="text-muted-foreground mb-4">
          Vá para a playlist para solicitar suas músicas favoritas.
        </p>
      </div>
    </div>
  );
}
