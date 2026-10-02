"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DoorOpen,
  Eye,
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
import { EntryApprovalWait } from "@/components/bars/entry-approval-wait";
import { MesaGrid } from "@/components/rooms/mesa-grid";
import { joinEntryAction } from "@/lib/bars/actions";
import {
  isOutsideBar,
  needsLocationConsent,
  PRESENCE_VIEWER_NOTICE,
} from "@/lib/bars/geo";
import { entryRoute } from "@/lib/bars/qr";
import type { PresenceDecision } from "@/lib/bars/geo";
import type { EntryBarPreview } from "@/types/bar";
import type { EntryMembership } from "@/types/room";

type EntryPreviewProps = {
  preview: EntryBarPreview;
  requestedMesa?: number | null;
  membership?: EntryMembership;
  presence?: PresenceDecision;
};

export function EntryPreview({
  preview,
  requestedMesa = null,
  membership,
  presence,
}: EntryPreviewProps) {
  const router = useRouter();
  const initialMesa = membership?.mesa_numero ?? requestedMesa ?? 1;
  const [mesa, setMesa] = useState<number>(clampMesa(initialMesa));
  const [currentMembership, setCurrentMembership] = useState<EntryMembership | undefined>(
    membership
  );
  const [state, setState] = useState<
    "idle" | "joining" | "pending" | "rejected" | "approved"
  >(membership?.status ?? "idle");

  function clampMesa(n: number) {
    return Math.min(Math.max(1, Math.round(n)), preview.quantidade_mesas);
  }

  /**
   * Três estados, não dois:
   *
   *   - sem coords/consentimento → `geoBlocked`: o botão espera o "Permitir
   *     localização". Sem o consentimento não dá para saber nada.
   *   - fora do raio (`outside`) → `outside`: entra **sem mesa** e sem poder
   *     pedir música (a fila barra em `buildQueueSongItem`), só assistindo.
   *   - dentro do raio → o fluxo normal, com a escolha de mesa.
   */
  const geoBlocked = presence && needsLocationConsent(presence) ? presence : null;
  const outside = isOutsideBar(presence);
  /** Fora do raio não escolhe mesa: a grade some e o join manda `null`. */
  const mesaChoice = !outside && preview.quantidade_mesas > 1;

  async function handleJoin() {
    setState("joining");
    const result = await joinEntryAction(preview.room_code, outside ? null : mesa);
    if (!result.ok) {
      setState("idle");
      if (result.geoRequired) {
        router.refresh();
        return;
      }
      toast.error(result.error);
      return;
    }
    setCurrentMembership(result.membership);
    setState(result.membership.status);
  }

  if (state === "pending" || state === "rejected" || state === "approved") {
    return (
      <EntryApprovalWait
        roomId={preview.room_id}
        roomCode={preview.room_code}
        barName={preview.bar_nome}
        mesa={currentMembership?.mesa_numero ?? mesa}
        initialStatus={state}
        // Quem está dentro do raio cai na sala, onde ficam a escolha da mesa e a
        // busca. Quem entrou de fora não tem as duas coisas (o corte de pedir
        // música é do servidor), então vai direto para o player.
        destination={outside ? `/player/${preview.room_code}` : undefined}
        cancelHref={entryRoute({ bar: preview.bar_code, mesa })}
        onRetry={async () => {
          await handleJoin();
        }}
      />
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
        {geoBlocked && <LocationGate error={geoBlocked.error} />}

        {outside && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <Eye className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{PRESENCE_VIEWER_NOTICE}</span>
          </div>
        )}

        {mesaChoice && (
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
          {outside && (
            <Badge variant="outline">
              <Eye className="size-3.5" />
              Só assistindo
            </Badge>
          )}
          {singleMesa && !outside && (
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
          ) : outside ? (
            <Eye className="size-4" />
          ) : (
            <LogIn className="size-4" />
          )}
          {geoBlocked
            ? "Habilitar localização para entrar"
            : outside
              ? "Assistir ao karaokê"
              : singleMesa
                ? "Entrar no bar"
                : `Entrar na mesa ${mesa}`}
        </Button>
      </CardContent>
    </Card>
  );
}
