"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Printer, TicketPlus } from "lucide-react";
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
import { RoomQr } from "@/components/rooms/room-qr";
import { pulseiraRedeemUrl } from "@/lib/bars/qr";
import { gerarPulseirasAction } from "@/lib/bars/pulseira-actions";
import { pulseiraStatus } from "@/lib/bars/pulseiras";
import { useClientOrigin } from "@/lib/use-client-origin";
import { PULSEIRA_LOTE_MAX, PULSEIRA_LOTE_PADRAO } from "@/types/bar";
import type { PulseiraCodeRow, PulseiraStatus } from "@/types/bar";
import { cn } from "cn";

type PulseiraCodesCardProps = {
  barId: string;
  barCode: string;
  codigos: PulseiraCodeRow[];
  disabled: boolean;
};

const STATUS_LABEL: Record<PulseiraStatus, string> = {
  disponivel: "disponível",
  usado: "usado",
  expirado: "expirado",
};

const STATUS_CLASS: Record<PulseiraStatus, string> = {
  disponivel: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  usado: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  expirado: "bg-muted text-muted-foreground border-border",
};

/**
 * Distribuição de códigos: gera o lote (1–100, 24h) e mostra cada pulseira com
 * o QR que já abre `/entrar?bar=…&pulseira=…`. A folha de QR é a própria grade
 * — o botão "Imprimir" usa o `window.print()`, e a página esconde o resto.
 */
export function PulseiraCodesCard({
  barId,
  barCode,
  codigos,
  disabled,
}: PulseiraCodesCardProps) {
  const router = useRouter();
  const origin = useClientOrigin();
  const [qtd, setQtd] = useState(String(PULSEIRA_LOTE_PADRAO));
  const [busy, setBusy] = useState(false);

  async function gerar() {
    setBusy(true);
    const result = await gerarPulseirasAction({ bar_id: barId, qtd });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${result.geradas} pulseira(s) gerada(s).`);
    router.refresh();
  }

  const agora = new Date();

  return (
    <Card className={cn(disabled && "opacity-60")} aria-disabled={disabled}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TicketPlus className="text-muted-foreground size-4" />
          Distribuição de códigos
        </CardTitle>
        <CardDescription>
          Cada código vale 24h e é de uso único. O QR já leva o visitante para a
          entrada com o código preenchido.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pulseira-qtd" className="text-xs">
              Quantidade (1–{PULSEIRA_LOTE_MAX})
            </Label>
            <Input
              id="pulseira-qtd"
              type="number"
              inputMode="numeric"
              min={1}
              max={PULSEIRA_LOTE_MAX}
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              disabled={disabled || busy}
              className="w-28"
            />
          </div>
          <Button type="button" onClick={gerar} disabled={disabled || busy}>
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <TicketPlus className="size-4" />
            )}
            Gerar códigos
          </Button>
          {codigos.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
              disabled={disabled}
            >
              <Printer className="size-4" />
              Imprimir folha
            </Button>
          )}
        </div>

        {codigos.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum código gerado ainda. Gere o primeiro lote para imprimir e levar
            ao balcão.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            {codigos.map((row) => {
              const status = pulseiraStatus(row, agora);
              return (
                <li
                  key={row.id}
                  className="flex flex-col items-center gap-2 rounded-xl border p-3 text-center break-inside-avoid"
                >
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                      STATUS_CLASS[status]
                    )}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                  <RoomQr
                    value={pulseiraRedeemUrl(barCode, row.codigo, origin)}
                    alt={`QR da pulseira ${row.codigo}`}
                    fileName={`pulseira-${row.codigo}.png`}
                    size={132}
                    fallbackLabel={row.codigo}
                    showDownload={!disabled}
                  />
                  <span className="font-mono text-sm font-semibold tracking-[0.2em]">
                    {row.codigo}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {status === "usado" && row.usado_em
                      ? `usado ${formatHoraHora(row.usado_em)}`
                      : `até ${formatHoraHora(row.expira_em)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Data/hora curta no fuso do bar, para a legenda do cartão impresso. */
function formatHoraHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
