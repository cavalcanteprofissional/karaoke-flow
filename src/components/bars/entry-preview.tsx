"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Hourglass, LoaderCircle, LogIn, ShieldCheck, Table2, User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { joinEntryAction } from "@/lib/bars/actions";
import type { EntryBarPreview } from "@/types/bar";
import { cn } from "cn";

type EntryPreviewProps = {
  preview: EntryBarPreview;
  requestedMesa?: number | null;
};

export function EntryPreview({ preview, requestedMesa = null }: EntryPreviewProps) {
  const router = useRouter();
  const [mesa, setMesa] = useState<number>(requestedMesa ? clampMesa(requestedMesa) : 1);
  const [state, setState] = useState<"idle" | "joining" | "pending">("idle");

  function clampMesa(n: number) {
    return Math.min(Math.max(1, Math.round(n)), preview.quantidade_mesas);
  }

  async function handleJoin() {
    setState("joining");
    const result = await joinEntryAction(preview.room_code, mesa);
    if (!result.ok) {
      setState("idle");
      toast.error(result.error);
      return;
    }
    if (result.membership.status === "approved") {
      router.push(`/salas/${preview.room_code}`);
      router.refresh();
      return;
    }
    setState("pending");
  }

  if (state === "pending") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
        <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
          <Hourglass className="size-6" />
        </span>
        <div>
          <p className="font-medium">Pedido de entrada enviado!</p>
          <p className="text-muted-foreground text-sm">
            {preview.bar_nome} vai aprovar sua entrada na mesa {mesa}. Assim que aprovar, você
            consegue pedir músicas.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          Voltar ao início
        </Button>
      </div>
    );
  }

  const singleMesa = preview.quantidade_mesas === 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{preview.bar_nome}</CardTitle>
          <span className="border-border bg-secondary/40 font-mono rounded-md border px-2 py-1 text-xs tracking-[0.2em]">
            {preview.bar_code}
          </span>
        </div>
        <CardDescription className="flex items-center gap-1.5">
          <User className="size-3.5" />
          {preview.host_name}
          {preview.bar_cidade && ` · ${preview.bar_cidade}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!singleMesa && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Table2 className="size-3.5" />
              Escolha a sua mesa
            </span>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {Array.from({ length: preview.quantidade_mesas }, (_, i) => i + 1).map((n) => {
                const selected = n === mesa;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMesa(n)}
                    className={cn(
                      "border-border hover:bg-secondary/60 flex h-12 items-center justify-center rounded-lg border font-mono text-base font-semibold transition-colors",
                      selected && "border-primary bg-primary text-primary-foreground"
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {preview.entry_mode === "open" ? (
            <Badge variant="secondary">
              <DoorOpen className="size-3.5" />
              Entrada livre
            </Badge>
          ) : (
            <Badge variant="outline">
              <ShieldCheck className="size-3.5" />
              Entrada com aprovação
            </Badge>
          )}
          {singleMesa && (
            <Badge variant="outline">
              <Table2 className="size-3.5" />
              Mesa única
            </Badge>
          )}
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleJoin}
          disabled={state === "joining"}
        >
          {state === "joining" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          {singleMesa ? "Entrar no bar" : `Entrar na mesa ${mesa}`}
        </Button>
      </CardContent>
    </Card>
  );
}