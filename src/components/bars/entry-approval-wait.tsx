"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  Hourglass,
  LoaderCircle,
  Play,
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
import { getEntryRequestStateAction } from "@/lib/bars/actions";
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
  /**
   * `navigate` (default) troca de rota na aprovação. `refresh` fica onde está —
   * para o chamador que já **está** na sala: o `router.refresh()` do servidor é o
   * que retira o card da tela, porque a linha deixa de ser `pending` e a página
   * já vem com o `MesaPicker` e a busca. Navegar para a própria URL ali seria um
   * `replace` inútil.
   */
  mode?: "navigate" | "refresh";
  /** Para onde voltar depois de cancelar (default: entrada pelo código da sala). */
  cancelHref?: string;
  onRetry?: () => void | Promise<void>;
};

/**
 * Quanto tempo o card de aprovação espera a navegação do client router antes de
 * oferecer o botão de escape. Um `router.replace()` que não completa é invisível
 * para quem está olhando a TV: sem este timer, a falha vira um spinner eterno.
 */
const NAV_FALLBACK_MS = 4000;

export function EntryApprovalWait({
  roomId,
  roomCode,
  barName,
  mesa = null,
  initialStatus = "pending",
  mode = "navigate",
  cancelHref,
  onRetry,
}: EntryApprovalWaitProps) {
  const backToEntry = cancelHref ?? `/entrar?code=${roomCode}`;
  // Sempre a sala: quem entrou fora do raio também cai aqui, em modo somente
  // leitura, e abre o player pelo botão "Ver o player" da própria sala.
  const target = `/salas/${roomCode}`;
  const router = useRouter();
  const [status, setStatus] = useState<WaitStatus>(initialStatus);
  const [currentMesa, setCurrentMesa] = useState<number | null>(mesa);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [navStalled, setNavStalled] = useState(false);
  const redirected = useRef(false);
  const navTimerRef = useRef<number | null>(null);

  /**
   * Aprovado: resolve a tela UMA vez — e resolve do jeito que o chamador pediu.
   *
   * `navigate` troca de rota e arma o timer de escape. `refresh` só revalida:
   * quem está no modo refresh já está na sala, e o servidor devolve a página sem
   * este card (a linha deixou de ser `pending`), então trocar de rota seria
   * recarregar a URL em que a pessoa já está.
   *
   * `router.replace()` e `router.refresh()` nunca juntos: o refresh revalida a
   * rota atual, que depois da aprovação devolve a própria tela de espera, e ele
   * preserva o estado do client component — o latch `redirected` continuava
   * `true` e nenhuma nova tentativa saía dali. Por isso aqui só se resolve por
   * um caminho, e a recuperação é o botão do timer.
   */
  const finish = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    setStatus("approved");
    if (mode === "refresh") {
      router.refresh();
      return;
    }
    router.replace(target);
    navTimerRef.current = window.setTimeout(() => setNavStalled(true), NAV_FALLBACK_MS);
  }, [mode, router, target]);

  useEffect(() => {
    if (status === "approved") finish();
  }, [status, finish]);

  useEffect(
    () => () => {
      if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
    },
    []
  );

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
        const { state } = await getEntryRequestStateAction(roomCode);
        if (!active) return;
        if (state === "closed") {
          setStatus("closed");
        } else if (state === "cancelled" || state === "none") {
          setStatus("cancelled");
        }
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
  }, [finish, roomCode, roomId, status]);

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
            {navStalled
              ? "A tela não avançou sozinha. Toque abaixo para abrir o karaokê agora."
              : mode === "refresh"
                ? `Entrada liberada para ${barName}. O painel vai se atualizar…`
                : `Estamos abrindo o karaokê de ${barName}. Só um instante…`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {navStalled ? (
            <>
              {/* <a> e não router.push: se o client router é justamente o que
                  travou, a navegação cheia não depende dele. */}
              <Button asChild size="lg" className="w-full">
                <a href={target}>
                  <Play className="size-4" />
                  Abrir o karaokê agora
                </a>
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                Se preferir digitar, abra <span className="font-mono">/entrar</span> e use
                o código <span className="font-mono tracking-[0.2em]">{roomCode}</span>.
              </p>
            </>
          ) : (
            <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
          )}
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
            onClick={() => router.replace(backToEntry)}
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
