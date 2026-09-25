"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Hourglass, LoaderCircle, MapPin } from "lucide-react";
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
import { cancelEntryRequestAction } from "@/lib/rooms/actions";
import type { PendingEntryRequest } from "@/lib/bars/actions";

type PendingEntryRequestsProps = {
  requests: PendingEntryRequest[];
  /** Rótulo do botão que leva à tela de espera (`/entrar?code=…`). */
  trackLabel?: string;
};

export function PendingEntryRequests({
  requests,
  trackLabel = "Acompanhar aprovação",
}: PendingEntryRequestsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (requests.length === 0) return null;

  /** `push` + `refresh` para não depender do Router Cache de uma URL já
   * visitada antes do pedido existir — o payload antigo é o do preview. */
  function track(roomCode: string) {
    router.push(`/entrar?code=${roomCode}`);
    router.refresh();
  }

  async function cancel(roomId: string) {
    const confirmed = window.confirm(
      "Cancelar seu pedido de entrada? O dono do karaokê deixa de ver o seu pedido."
    );
    if (!confirmed) return;

    setBusy(roomId);
    const result = await cancelEntryRequestAction(roomId);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível cancelar o pedido.");
      return;
    }
    toast.success("Pedido cancelado.");
    router.refresh();
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="size-4 text-amber-600" />
          Pedidos de entrada aguardando aprovação
        </CardTitle>
        <CardDescription>
          Você já pediu entrada e o dono ainda não respondeu. Acompanhe pela tela de
          espera — a sala abre sozinha assim que ele aprovar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {requests.map((request) => (
          <div
            key={request.roomId}
            className="bg-background/60 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
                <Hourglass className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{request.barName}</p>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <span className="font-mono tracking-[0.2em]">{request.roomCode}</span>
                  {request.mesaNumero != null && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        Mesa {request.mesaNumero}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant="outline" className="text-xs">
                aguardando
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => track(request.roomCode)}
              >
                {trackLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                disabled={busy === request.roomId}
                onClick={() => void cancel(request.roomId)}
              >
                {busy === request.roomId ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Ban className="size-4" />
                )}
                Cancelar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
