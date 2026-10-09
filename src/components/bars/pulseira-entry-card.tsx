"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck, ShieldX, Ticket, TicketCheck } from "lucide-react";
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
import { resgatarPulseiraAction } from "@/lib/bars/pulseira-actions";
import { formatCentavos, precoPulseiraHoje } from "@/lib/bars/pulseiras";
import type { PulseiraPreco } from "@/types/bar";

type PulseiraEntryCardProps = {
  barId: string;
  barName: string;
  pulseirasAtivadas: boolean;
  precos: PulseiraPreco[];
  /** Código que veio no QR (`?bar=…&pulseira=…`), preenchido de antemão. */
  initialPulseira?: string | null;
  isAnonymous: boolean;
  temPulseira: boolean;
};

/**
 * Bloco da pulseira na tela de entrada (Fase 18): o cartaz de valores do dia
 * mais o resgate do código em UM lugar — quem chegou pelo QR da pulseira já
 * chega com o código preenchido e ativa com um toque. Usuário anônimo não
 * ativa (o banco decide: porta fechada em `resgatar_pulseira`) e vê a
 * orientação de criar conta.
 */
export function PulseiraEntryCard({
  barId,
  barName,
  pulseirasAtivadas,
  precos,
  initialPulseira,
  isAnonymous,
  temPulseira,
}: PulseiraEntryCardProps) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(initialPulseira?.trim().toUpperCase() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resgatada, setResgatada] = useState(false);

  if (!pulseirasAtivadas) return null;

  const hojeCentavos = precoPulseiraHoje(precos);

  async function ativar() {
    if (!codigo) {
      setError("Digite o código da pulseira.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await resgatarPulseiraAction({ bar_id: barId, codigo });
    setBusy(false);

    if (result.ok) {
      setResgatada(true);
      toast.success(result.message);
      // `revalidatePath` rodou na action: a próxima leitura já devolve
      // `tem_pulseira = true` no status de entrada.
      router.refresh();
      return;
    }

    if (result.code === "UNAUTHENTICATED") {
      setError("Você precisa fazer login para usar a pulseira.");
      return;
    }
    setError(result.error);
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {temPulseira || resgatada ? (
            <TicketCheck className="text-emerald-600 dark:text-emerald-400 size-4" />
          ) : (
            <Ticket className="text-muted-foreground size-4" />
          )}
          Pulseira de {barName}
        </CardTitle>
        <CardDescription>
          {temPulseira || resgatada ? (
            "Você está com a pulseira ativa — pode pedir música!"
          ) : (
            <>
              Ative o código da sua pulseira para cantar ao vivo.{" "}
              {hojeCentavos === null && precos.length === 0
                ? "Hoje não há faixa de valor: a pulseira é liberada de graça."
                : hojeCentavos !== null
                  ? `O valor de hoje é ${formatCentavos(hojeCentavos)}.`
                  : "Sem faixa de valor no horário atual."}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {temPulseira || resgatada ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
            <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Pulseira ativa. Boa sorte no palco!</span>
          </div>
        ) : isAnonymous ? (
          <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <ShieldX className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Crie uma conta anônima com e-mail ou entre para ativar a pulseira.
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-36 flex-col gap-1.5">
                <Label htmlFor="pulseira-codigo" className="text-xs">
                  Código da pulseira
                </Label>
                <Input
                  id="pulseira-codigo"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Ex: ZK7Q2P"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void ativar();
                  }}
                  disabled={busy}
                  className="font-mono tracking-widest"
                />
              </div>
              <Button
                type="button"
                onClick={ativar}
                disabled={busy || codigo.length < 3}
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Ticket className="size-4" />
                )}
                Ativar pulseira
              </Button>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}