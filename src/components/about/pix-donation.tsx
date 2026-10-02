"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildPixPayload, PixPayloadError } from "@/lib/pix/brcode";

type PixDonationProps = {
  chave: string;
  nome: string;
  cidade: string;
};

/**
 * Valores simbólicos — o propósito é manter o app vivo, não cobrar barato.
 * Três degraus com um campo livre na mão: os valores fixos viram botão (dois
 * toques: escolher e pagar) e o campo cobre quem prefere digitar.
 */
const VALORES = [2, 5, 10];

export function PixDonation({ chave, nome, cidade }: PixDonationProps) {
  const [valor, setValor] = useState<number | null>(5);
  const [copiado, setCopiado] = useState(false);
  const [qr, setQr] = useState<{ payload: string; url: string } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  const resultado = useMemo(() => {
    try {
      return { payload: buildPixPayload({ chave, nome, cidade, valor }), erro: null };
    } catch (error) {
      // Chave mal configurada é erro de deploy, não de doador: mostrar a chave
      // em texto continua sendo a saída (é só copiar e colar no banco).
      return {
        payload: null,
        erro: error instanceof PixPayloadError ? error.message : "Chave Pix inválida.",
      };
    }
  }, [chave, nome, cidade, valor]);

  const payload = resultado.payload;

  /**
   * O resultado do QR carrega o `payload` que o produziu, como no `RoomQr`:
   * assim o estado antigo é ignorado quando o valor muda (o QR do valor
   * anterior não fica na tela enquanto o novo carrega) e não precisa de um
   * `setState` de reset dentro do effect — que a regra `react-hooks` barra.
   */
  useEffect(() => {
    if (!payload) return;
    let active = true;
    QRCode.toDataURL(payload, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) {
          setQr({ payload, url });
          setFalha(null);
        }
      })
      .catch((error: unknown) => {
        console.error("[PixDonation] falha ao gerar o QR", { chave, error });
        if (active) setFalha("Não foi possível gerar o QR. Use o código copia e cola abaixo.");
      });
    return () => {
      active = false;
    };
  }, [payload, chave]);

  async function copiar() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFalha("O navegador bloqueou a cópia. Selecione o código abaixo e copie à mão.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Escolha um valor:</span>
        {VALORES.map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={v === valor ? "default" : "outline"}
            onClick={() => setValor(v)}
            aria-pressed={v === valor}
          >
            {v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </Button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border bg-white p-2">
          {falha ? (
            <TriangleAlert className="size-6 text-destructive" aria-hidden />
          ) : qr?.payload === payload ? (
            /* eslint-disable-next-line @next/next/no-img-element -- data URL PNG; next/image não trata */
            <img
              src={qr.url}
              alt={`QR Pix de R$ ${valor?.toFixed(2)}`}
              className="size-full"
              width={176}
              height={176}
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="pix-valor" className="text-xs">
              Outro valor (R$)
            </label>
            <input
              id="pix-valor"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.5}
              value={valor ?? ""}
              onChange={(event) => {
                const bruto = event.target.value;
                setValor(bruto === "" ? null : Number(bruto));
              }}
              className="border-input bg-background w-32 rounded-md border px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <Button type="button" variant="outline" size="sm" onClick={copiar} disabled={!payload}>
            {copiado ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            {copiado ? "Copiado!" : "Copiar código Pix"}
          </Button>
        </div>
      </div>

      {resultado.erro && (
        <p role="alert" className="text-amber-500 text-sm">
          {resultado.erro} A chave abaixo ainda funciona copiada à mão:
        </p>
      )}

      {falha && (
        <p role="alert" className="text-amber-500 text-sm">
          {falha}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Código Pix (copia e cola)</span>
        <textarea
          readOnly
          value={payload ?? ""}
          rows={3}
          onFocus={(event) => event.currentTarget.select()}
          className="text-muted-foreground bg-muted/40 w-full resize-none rounded-md border p-2 font-mono text-xs break-all"
        />
      </label>

      <p className="text-muted-foreground text-xs">
        Chave: <span className="font-mono">{chave}</span>
      </p>
    </div>
  );
}
