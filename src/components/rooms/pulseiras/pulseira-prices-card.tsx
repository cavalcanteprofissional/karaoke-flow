"use client";

import { useState } from "react";
import { LoaderCircle, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removerPrecoPulseiraAction,
  salvarPrecoPulseiraAction,
} from "@/lib/bars/pulseira-actions";
import {
  formatCentavos,
  formatHora,
  horaLocalPulseira,
  precoPulseiraHoje,
  reaisParaCentavos,
} from "@/lib/bars/pulseiras";
import { DIAS_SEMANA } from "@/types/bar";
import type { PulseiraPreco } from "@/types/bar";
import { cn } from "cn";

type PulseiraPricesCardProps = {
  barId: string;
  precos: PulseiraPreco[];
  disabled: boolean;
};

/**
 * Valor da pulseira por dia + faixa de horas. É um CARTÁVEL, não uma cobrança
 * (decisão da Fase 18): sem faixa, o resgate acontece sem preço. A faixa que
 * cobre AGORA aparece destacada — é o "valor de hoje" do cartaz público.
 */
export function PulseiraPricesCard({
  barId,
  precos,
  disabled,
}: PulseiraPricesCardProps) {
  const [dia, setDia] = useState(String(horaLocalPulseira().dow));
  const [inicio, setInicio] = useState("18:00");
  const [fim, setFim] = useState("22:00");
  const [valor, setValor] = useState("");
  const [busy, setBusy] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  async function salvar() {
    const centavos = reaisParaCentavos(valor);
    if (centavos === null) {
      toast.error("Informe um valor válido (ex: 10,00).");
      return;
    }
    setBusy(true);
    const result = await salvarPrecoPulseiraAction({
      bar_id: barId,
      dia_semana: dia,
      inicio,
      fim,
      preco_centavos: centavos,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Faixa de valor salva.");
  }

  async function remover(preco: PulseiraPreco) {
    setRemovendo(`${preco.dia_semana}-${preco.hora_inicio}`);
    const result = await removerPrecoPulseiraAction({
      bar_id: barId,
      dia_semana: preco.dia_semana,
      inicio: formatHora(preco.hora_inicio),
    });
    setRemovendo(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Faixa removida.");
  }

  const hojeCentavos = precoPulseiraHoje(precos);

  return (
    <Card className={cn(disabled && "opacity-60")} aria-disabled={disabled}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="text-muted-foreground size-4" />
          Valor da pulseira
        </CardTitle>
        <CardDescription>
          Preço por dia e faixa de horas.{" "}
          <span className="font-medium">Valor de referência — sem cobrança pelo app.</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pulseira-dia" className="text-xs">
              Dia
            </Label>
            <select
              id="pulseira-dia"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              disabled={disabled || busy}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              {DIAS_SEMANA.map((nome, indice) => (
                <option key={nome} value={indice}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pulseira-inicio" className="text-xs">
              Início
            </Label>
            <Input
              id="pulseira-inicio"
              type="time"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              disabled={disabled || busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pulseira-fim" className="text-xs">
              Fim
            </Label>
            <Input
              id="pulseira-fim"
              type="time"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              disabled={disabled || busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pulseira-valor" className="text-xs">
              Valor (R$)
            </Label>
            <Input
              id="pulseira-valor"
              inputMode="decimal"
              placeholder="10,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={disabled || busy}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={salvar}
          disabled={disabled || busy}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Salvar faixa
        </Button>

        {precos.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma faixa cadastrada. Sem valores, a pulseira é liberada sem preço.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {DIAS_SEMANA.map((nome, indice) => {
              const doDia = precos
                .filter((p) => p.dia_semana === indice)
                .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
              if (doDia.length === 0) return null;
              return (
                <div key={nome} className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {nome}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {doDia.map((p) => {
                      const ativa =
                        hojeCentavos !== null &&
                        p.preco_centavos === hojeCentavos &&
                        p.dia_semana === horaLocalPulseira().dow;
                      const chave = `${p.id}`;
                      return (
                        <li
                          key={chave}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
                            ativa && "border-emerald-500/40 bg-emerald-500/5"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-mono">
                              {formatHora(p.hora_inicio)}–{formatHora(p.hora_fim)}
                            </span>
                            <span className="font-medium">{formatCentavos(p.preco_centavos)}</span>
                            {ativa && (
                              <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold tracking-wide uppercase">
                                hoje
                              </span>
                            )}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => remover(p)}
                            disabled={disabled || removendo === chave}
                            aria-label={`Remover faixa ${formatHora(p.hora_inicio)} de ${nome}`}
                          >
                            {removendo === chave ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="text-muted-foreground size-4" />
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
