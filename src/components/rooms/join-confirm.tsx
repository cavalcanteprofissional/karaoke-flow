"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hourglass, LoaderCircle, LogIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { joinRoomAction } from "@/lib/rooms/actions";

type JoinConfirmProps = {
  code: string;
};

export function JoinConfirm({ code }: JoinConfirmProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "joining" | "pending">("idle");

  async function handleJoin() {
    setState("joining");
    const result = await joinRoomAction(code);
    if (!result.ok) {
      setState("idle");
      toast.error(result.error);
      return;
    }
    if (result.membership.status === "approved") {
      router.push(`/salas/${code}`);
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
            O dono da sala <span className="font-mono">{code}</span> vai aprovar sua
            entrada. Assim que entrar, você consegue pedir músicas.
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

  return (
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
      Entrar na sala
    </Button>
  );
}
