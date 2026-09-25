"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DoorOpen,
  Hourglass,
  LoaderCircle,
  LogIn,
  ShieldCheck,
  Table2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LocationGate } from "@/components/bars/location-gate";
import { MesaGrid } from "@/components/rooms/mesa-grid";
import { joinEntryAction } from "@/lib/bars/actions";
import type { PresenceDecision } from "@/lib/bars/geo";
import type { EntryBarPreview } from "@/types/bar";

type EntryPreviewProps = {
  preview: EntryBarPreview;
  requestedMesa?: number | null;
  presence?: PresenceDecision;
};

export function EntryPreview({
  preview,
  requestedMesa = null,
  presence,
}: EntryPreviewProps) {
  const router = useRouter();
  const [mesa, setMesa] = useState<number>(requestedMesa ? clampMesa(requestedMesa) : 1);
  const [state, setState] = useState<"idle" | "joining" | "pending">("idle");

  function clampMesa(n: number) {
    return Math.min(Math.max(1, Math.round(n)), preview.quantidade_mesas);
  }

  const geoBlocked = presence && !presence.ok;

  async function handleJoin() {
    setState("joining");
    const result = await joinEntryAction(preview.room_code, mesa);
    if (!result.ok) {
      setState("idle");
      if (result.geoRequired) {
        router.refresh();
        return;
      }
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
            {preview.bar_nome} vai aprovar sua entrada na mesa {mesa}. Assim que aprovar,
            você consegue pedir músicas.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
        >
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
          <span className="border-border bg-secondary/40 rounded-md border px-2 py-1 font-mono text-xs tracking-[0.2em]">
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
        {geoBlocked && <LocationGate error={presence.error} />}

        {!singleMesa && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Table2 className="size-3.5" />
              Escolha a sua mesa
            </span>
            <MesaGrid
              quantidadeMesas={preview.quantidade_mesas}
              selected={mesa}
              onSelect={setMesa}
            />
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
          disabled={state === "joining" || !!geoBlocked}
        >
          {state === "joining" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          {geoBlocked
            ? "Habilitar localização para entrar"
            : singleMesa
              ? "Entrar no bar"
              : `Entrar na mesa ${mesa}`}
        </Button>
      </CardContent>
    </Card>
  );
}
