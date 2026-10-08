"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBarMesasAction } from "@/lib/bars/actions";
import { MESA_MAX } from "@/types/bar";

type MesasBarCardProps = {
  bar: {
    id: string;
    /** Quantas mesas o bar tem hoje — valor vivo do servidor (`bars.quantidade_mesas`). */
    quantidade_mesas: number;
  };
};

/**
 * "Mesas do bar" — 1 por padrão, até `MESA_MAX` (Fase 16). Partido de
 * `room-settings.tsx` na Fase 17; mora em `/salas/[codigo]/sala`, junto do
 * Cartaz e QR das mesas (quem mexe em mesa mexe também no QR).
 */
export function MesasBarCard({ bar }: MesasBarCardProps) {
  const router = useRouter();
  // O valor vive no servidor e é sincronizado pela RPC `update_bar_mesas`.
  const [mesasInput, setMesasInput] = useState(String(bar.quantidade_mesas));
  const [mesasBusy, setMesasBusy] = useState(false);

  async function saveMesas() {
    const next = Number(mesasInput);
    if (!Number.isInteger(next) || next < 1 || next > MESA_MAX) {
      toast.error(`Informe de 1 a ${MESA_MAX} mesas.`);
      return;
    }
    if (next === bar.quantidade_mesas) return;
    if (next < bar.quantidade_mesas) {
      const confirmed = window.confirm(
        `Diminuir de ${bar.quantidade_mesas} para ${next} mesa(s)? Quem estiver sentado nas mesas removidas vai para a mesa 1.`
      );
      if (!confirmed) return;
    }
    setMesasBusy(true);
    const result = await updateBarMesasAction(bar.id, next);
    setMesasBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMesasInput(String(result.quantidadeMesas));
    toast.success(
      result.reallocados > 0
        ? `Mesas atualizadas. ${result.reallocados} pessoa(s) foram para a mesa 1.`
        : "Quantidade de mesas atualizada."
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutGrid className="text-muted-foreground size-4" />
          Mesas do bar
        </CardTitle>
        <CardDescription>
          De 1 a {MESA_MAX} mesas. Um bar de mesa única não pergunta a mesa na
          entrada: quem entra pelo código já senta na mesa 1. Diminuir remove as
          últimas mesas e move quem estava nelas para a mesa 1.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            id="bar-mesas"
            type="number"
            inputMode="numeric"
            min={1}
            max={MESA_MAX}
            value={mesasInput}
            onChange={(event) => setMesasInput(event.target.value)}
            className="w-24"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={saveMesas}
            disabled={mesasBusy || mesasInput === String(bar.quantidade_mesas)}
          >
            {mesasBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <LayoutGrid className="size-4" />
            )}
            Salvar
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Hoje o bar tem <span className="font-medium">{bar.quantidade_mesas}</span>{" "}
          {bar.quantidade_mesas === 1 ? "mesa" : "mesas"}.
        </p>
      </CardContent>
    </Card>
  );
}
