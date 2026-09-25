"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  Hourglass,
  LoaderCircle,
  Power,
  RotateCcw,
  ShieldCheck,
  Store,
  Table2,
  X,
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
import { cancelEntryRequestAction } from "@/lib/rooms/actions";
import { createClient } from "@/lib/supabase/client";
import type { MemberStatus } from "@/types/room";

type WaitStatus = MemberStatus | "closed" | "cancelled";

type EntryApprovalWaitProps = {
  roomId: string;
  roomCode: string;
  barName: string;
  mesa?: number | null;
  initialStatus?: MemberStatus;
  destination?: string | null;
  /** Para onde voltar depois de cancelar (default: entrada pelo código da sala). */
  cancelHref?: string;
  onRetry?: () => void | Promise<void>;
};

export function EntryApprovalWait({
  roomId,
  roomCode,
  barName,
  mesa = null,
  initialStatus = "pending",
  destination,
  cancelHref,
  onRetry,
}: EntryApprovalWaitProps) {
  const backToEntry = cancelHref ?? `/entrar?code=${roomCode}`;
  const router = useRouter();
  const [status, setStatus] = useState<WaitStatus>(initialStatus);
  const [currentMesa, setCurrentMesa] = useState<number | null>(mesa);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const redirected = useRef(false);

  const finish = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    setStatus("approved");
    if (destination !== null) {
      router.replace(destination ?? `/salas/${roomCode}`);
    }
    router.refresh();
  }, [destination, roomCode, router]);

  useEffect(() => {
    if (status === "approved") finish();
  }, [status, finish]);

  useEffect(() => {
    if (status !== "pending") return;

    let active = true;
    const supabase = createClient();

    const reconcile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user) return;

      const { data: membership, error } = await supabase
        .from("room_members")
        .select("status, mesa_numero")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active || error) return;

      if (!membership) {
        setStatus("closed");
        return;
      }

      setCurrentMesa(membership.mesa_numero ?? null);
      if (membership.status === "approved") {
        finish();
      } else if (membership.status === "rejected") {
        setStatus("rejected");
      }
    };

    const channel = supabase
      .channel(`entry-approval:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void reconcile();
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") void reconcile();
      });

    const poll = window.setInterval(() => {
      void reconcile();
    }, 8000);

    return () => {
      active = false;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [finish, roomId, status]);

  async function retry() {
    setRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        router.push(`/entrar?code=${roomCode}`);
      }
    } finally {
      setRetrying(false);
    }
  }

  function goHome() {
    router.push("/dashboard");
  }

  /** Cancela o pedido: apaga a linha `pending` e volta ao preview do bar/sala,
   * de onde já é possível enviar um novo pedido. */
  async function cancel() {
    const confirmed = window.confirm(
      "Cancelar seu pedido de entrada? O dono do karaokê deixa de ver o seu pedido."
    );
    if (!confirmed) return;

    setCancelling(true);
    const result = await cancelEntryRequestAction(roomId);
    setCancelling(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível cancelar o pedido.");
      return;
    }
    toast.success("Pedido cancelado.");
    setStatus("cancelled");
    router.replace(backToEntry);
    router.refresh();
  }

  if (status === "approved") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5" aria-live="polite">
        <CardHeader className="items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <Check className="size-7" />
          </span>
          <CardTitle>Entrada aprovada!</CardTitle>
          <CardDescription>
            Estamos abrindo o karaokê de {barName}. Só um instante…
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (status === "rejected") {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5" aria-live="polite">
        <CardHeader className="items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-600">
            <X className="size-7" />
          </span>
          <CardTitle>Seu pedido não foi aprovado</CardTitle>
          <CardDescription>
            O host recusou seu pedido de entrada. Você pode enviar um novo pedido quando
            quiser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => void retry()}
            disabled={retrying}
          >
            {retrying ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Tentar novamente
          </Button>
          <Button type="button" variant="ghost" onClick={goHome}>
            Voltar ao início
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "cancelled") {
    return (
      <Card className="border-dashed" aria-live="polite">
        <CardHeader className="items-center text-center">
          <span className="bg-secondary text-secondary-foreground flex size-14 items-center justify-center rounded-full">
            <Ban className="size-7" />
          </span>
          <CardTitle>Pedido cancelado</CardTitle>
          <CardDescription>
            Você cancelou o pedido de entrada em {barName}. Dá para enviar um novo pedido
            quando quiser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              router.replace(backToEntry);
              router.refresh();
            }}
          >
            <RotateCcw className="size-4" />
            Enviar novo pedido
          </Button>
          <Button type="button" variant="ghost" onClick={goHome}>
            Voltar ao início
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "closed") {
    return (
      <Card className="border-dashed" aria-live="polite">
        <CardHeader className="items-center text-center">
          <span className="bg-secondary text-secondary-foreground flex size-14 items-center justify-center rounded-full">
            <Power className="size-7" />
          </span>
          <CardTitle>Esta sala foi encerrada</CardTitle>
          <CardDescription>
            O karaokê de {barName} não está mais recebendo entradas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button type="button" variant="outline" onClick={goHome}>
            Voltar ao início
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5" aria-live="polite">
      <CardHeader className="items-center text-center">
        <span className="flex size-14 animate-pulse items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
          <Hourglass className="size-7" />
        </span>
        <div className="flex flex-col items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            Aguardando aprovação
          </Badge>
          <CardTitle>Seu pedido de entrada foi enviado</CardTitle>
          <CardDescription>
            O host de {barName} precisa aprovar sua entrada. Você não precisa fazer mais
            nada: esta tela abrirá o karaokê automaticamente.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="bg-background/60 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border px-4 py-3 text-sm">
          <Store className="text-muted-foreground size-4" />
          <span className="font-medium">{barName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono tracking-[0.2em]">{roomCode}</span>
          {currentMesa !== null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="flex items-center gap-1">
                <Table2 className="text-muted-foreground size-3.5" />
                Mesa {currentMesa}
              </span>
            </>
          )}
        </div>
        <p className="text-muted-foreground flex items-center gap-2 text-center text-sm">
          <span className="size-2 animate-pulse rounded-full bg-amber-500" />
          Estamos acompanhando a aprovação do host…
        </p>
        <div className="flex w-full flex-col items-center gap-1">
          <Button type="button" variant="ghost" className="w-full" onClick={goHome}>
            Voltar ao início
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive w-full"
            onClick={() => void cancel()}
            disabled={cancelling}
          >
            {cancelling ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Ban className="size-4" />
            )}
            Cancelar pedido
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
