"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Table2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MesaGrid } from "@/components/rooms/mesa-grid";
import { pickMesaAction } from "@/lib/rooms/actions";

type MesaPickerProps = {
  roomId: string;
  quantidadeMesas: number;
};

/** Passo obrigatório para quem entrou por CÓDIGO (sem mesa): escolher uma das
 * mesas abertas da casa dentro da sala, antes de usar a fila. */
export function MesaPicker({ roomId, quantidadeMesas }: MesaPickerProps) {
  const router = useRouter();
  const [mesa, setMesa] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (mesa === null) {
      toast.error("Escolha uma mesa para continuar.");
      return;
    }
    setBusy(true);
    const result = await pickMesaAction(roomId, mesa);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar a mesa.");
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="text-muted-foreground size-4" />
          Escolha a sua mesa
        </CardTitle>
        <CardDescription>
          Você entrou pelo código. Para pedir músicas, escolha uma das mesas abertas da
          casa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <MesaGrid quantidadeMesas={quantidadeMesas} selected={mesa} onSelect={setMesa} />
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleConfirm}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Table2 className="size-4" />
          )}
          Confirmar mesa{mesa !== null ? ` ${mesa}` : ""}
        </Button>
      </CardContent>
    </Card>
  );
}
