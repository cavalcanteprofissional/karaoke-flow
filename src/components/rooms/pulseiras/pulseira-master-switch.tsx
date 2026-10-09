"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Ticket } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setPulseirasAtivadasAction } from "@/lib/bars/pulseira-actions";
import { cn } from "cn";

type PulseiraMasterSwitchProps = {
  barId: string;
  barNome: string;
  initialAtivadas: boolean;
};

/**
 * Interruptor mestre da pulseira (`bars.pulseiras_ativadas`). Com ele OFF, o
 * card de códigos e o de valores ficam esmaecidos e inertes — o bar voltou a ser
 * "todo mundo dentro do raio canta". Com ele ON, a trigger de `queue_items`
 * passa a exigir a pulseira.
 */
export function PulseiraMasterSwitch({
  barId,
  barNome,
  initialAtivadas,
}: PulseiraMasterSwitchProps) {
  const [ativadas, setAtivadas] = useState(initialAtivadas);
  const [busy, setBusy] = useState(false);
  const anterior = useRef(initialAtivadas);

  async function commit(next: boolean) {
    anterior.current = ativadas;
    setAtivadas(next);
    setBusy(true);
    const result = await setPulseirasAtivadasAction({ bar_id: barId, ativadas: next });
    setBusy(false);
    if (!result.ok) {
      setAtivadas(anterior.current);
      toast.error(result.error);
      return;
    }
    toast.success(
      next
        ? `Pulseira ligada em ${barNome}.`
        : `Pulseira desligada em ${barNome}.`
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2 text-base", busy && "opacity-80")}>
          <Ticket className="text-muted-foreground size-4" />
          Pulseira
          {busy && <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />}
        </CardTitle>
        <CardDescription>
          O ingresso de uso único do bar: quem quiser cantar ativa um código aqui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="toggle-pulseira" className="text-sm">
              {ativadas ? "Pulseira ligada" : "Pulseira desligada"}
            </Label>
            <p className="text-muted-foreground text-xs">
              {ativadas
                ? "Só canta quem tiver a pulseira ativa. O host é isento."
                : "Todo mundo dentro do raio pede música — sem ingresso."}
            </p>
          </div>
          <Switch
            id="toggle-pulseira"
            checked={ativadas}
            disabled={busy}
            onCheckedChange={commit}
          />
        </div>
      </CardContent>
    </Card>
  );
}
