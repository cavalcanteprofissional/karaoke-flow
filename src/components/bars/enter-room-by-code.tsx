"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DoorOpen,
  Eye,
  LoaderCircle,
  LogIn,
  RotateCcw,
  ShieldCheck,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EntryApprovalWait } from "@/components/bars/entry-approval-wait";
import { enterRoomByCodeAction } from "@/lib/bars/actions";
import { isOutsideBar, PRESENCE_VIEWER_NOTICE } from "@/lib/bars/geo";
import type { PresenceDecision } from "@/lib/bars/geo";
import type { EntryBarPreview } from "@/types/bar";
import type { EntryMembership } from "@/types/room";

type EnterRoomByCodeProps = {
  code: string;
  preview: EntryBarPreview;
  membership?: EntryMembership;
  /**
   * A mesma decisão que o preview recebeu da server action: quem está fora do
   * raio entra como espectador — sem mesa, sem busca de música e com o aviso
   * visível antes de entrar, porque o corte é do servidor.
   */
  presence?: PresenceDecision;
};

type EnterStatus = "idle" | "joining" | "error" | "pending" | "rejected" | "approved";

/** Entrada DIRETA por código de sala: no mount, chama a Server Action de
 * entrada (queda do anti-pattern de mutação durante o render) e redireciona. */
export function EnterRoomByCode({ code, preview, membership, presence }: EnterRoomByCodeProps) {
  const router = useRouter();
  const [status, setStatus] = useState<EnterStatus>(membership?.status ?? "idle");
  const [errorMsg, setErrorMsg] = useState("");
  const firedRef = useRef(false);

  const enter = useCallback(async () => {
    setStatus("joining");
    const result = await enterRoomByCodeAction(code);
    if (result.ok) {
      setStatus(result.membership.status);
      return;
    }
    if (result.geoRequired) {
      router.refresh();
      return;
    }
    setErrorMsg(result.error);
    setStatus("error");
  }, [code, router]);

  useEffect(() => {
    if (membership) return;
    if (firedRef.current) return;
    firedRef.current = true;
    void enter();
  }, [enter, membership]);

  if (status === "pending" || status === "rejected" || status === "approved") {
    return (
      <EntryApprovalWait
        roomId={preview.room_id}
        roomCode={preview.room_code}
        barName={preview.bar_nome}
        mesa={membership?.mesa_numero ?? null}
        initialStatus={status}
        // Default é a sala, inclusive para quem está fora do raio: é lá que a
        // fila fica ao vivo e que o player abre pelo botão "Ver o player".
        // Mandar direto ao player tiraria a pessoa da fila e, sem token de TV,
        // ela cairia no modo espectador sem explicação.
        onRetry={enter}
      />
    );
  }

  const joining = status === "joining" || status === "idle";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{preview.bar_nome}</CardTitle>
          <span className="border-border bg-secondary/40 rounded-md border px-2 py-1 font-mono text-xs tracking-[0.2em]">
            {code}
          </span>
        </div>
        <CardDescription className="flex items-center gap-1.5">
          <User className="size-3.5" />
          {preview.host_name}
          {preview.bar_cidade && ` · ${preview.bar_cidade}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
        </div>

        {joining ? (
          <div className="flex items-center justify-center gap-2 rounded-lg p-4">
            <LoaderCircle className="size-4 animate-spin" />
            <span className="text-muted-foreground text-sm">
              Entrando na sala {code}…
            </span>
          </div>
        ) : (
          <>
            <div className="text-destructive border-destructive/30 bg-destructive/10 flex items-center gap-2 rounded-lg border p-3 text-sm">
              {errorMsg}
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => void enter()}
            >
              <RotateCcw className="size-4" />
              Tentar novamente
            </Button>
          </>
        )}

        {isOutsideBar(presence) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <Eye className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{PRESENCE_VIEWER_NOTICE}</span>
          </div>
        )}

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <LogIn className="size-3.5" />
          {isOutsideBar(presence)
            ? "Você entra sem mesa e acompanha a fila pela tela da sala."
            : "A mesa é escolhida depois, já dentro da sala."}
        </p>
      </CardContent>
    </Card>
  );
}
