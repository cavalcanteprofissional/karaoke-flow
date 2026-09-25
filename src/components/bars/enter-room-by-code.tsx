"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DoorOpen,
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
import { enterRoomByCodeAction } from "@/lib/bars/actions";
import type { EntryBarPreview } from "@/types/bar";

type EnterRoomByCodeProps = {
  code: string;
  preview: EntryBarPreview;
};

/** Entrada DIRETA por código de sala: no mount, chama a Server Action de
 * entrada (queda do anti-pattern de mutação durante o render) e redireciona. */
export function EnterRoomByCode({ code, preview }: EnterRoomByCodeProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const firedRef = useRef(false);

  const enter = useCallback(async () => {
    setStatus("joining");
    const result = await enterRoomByCodeAction(code);
    if (result.ok) {
      router.push(result.redirect);
      router.refresh();
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
    if (firedRef.current) return;
    firedRef.current = true;
    void enter();
  }, [enter]);

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

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <LogIn className="size-3.5" />A mesa é escolhida depois, já dentro da sala.
        </p>
      </CardContent>
    </Card>
  );
}
