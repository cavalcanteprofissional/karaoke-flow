"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, TriangleAlert } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

type RoomQrProps = {
  value: string;
  alt?: string;
  fileName?: string;
  /** Lado da imagem em pixels (a tela do player usa um QR grande). */
  size?: number;
  /** O quiosque da TV não mostra download. */
  showDownload?: boolean;
  /**
   * Texto exibido quando o QR não renderiza — normalmente o código, para a
   * pessoa digitar à mão. Sem isso a tela fica num placeholder eterno.
   */
  fallbackLabel?: string;
};

export function RoomQr({
  value,
  alt = "QR da sala",
  fileName = "qr-sala.png",
  size = 192,
  showDownload = true,
  fallbackLabel,
}: RoomQrProps) {
  /**
   * O resultado carrega o `value`/`size` que o produziram. Assim o estado
   * antigo é simplesmente ignorado quando a URL muda, e o skeleton volta sem
   * precisar de um `setState` de reset dentro do effect (o React Compiler
   * rejeita isso, e ele mascararia o QR anterior durante a regeração).
   */
  const [result, setResult] = useState<{
    value: string;
    size: number;
    url: string;
  } | null>(null);
  const [failure, setFailure] = useState<{ value: string; size: number } | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setResult({ value, size, url });
      })
      .catch((error: unknown) => {
        // Antes isto fazia `setDataUrl(null)` e mais nada: o componente caía no
        // mesmo branch do "carregando" e ficava num skeleton eterno, sem log e
        // sem dizer o que houve. Erro de geração precisa ser visível.
        console.error("[RoomQr] falha ao gerar o QR", { value, error });
        if (active) setFailure({ value, size });
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  const dataUrl =
    result && result.value === value && result.size === size ? result.url : null;
  const failed = failure !== null && failure.value === value && failure.size === size;

  if (failed) {
    return (
      <div
        className="border-destructive/40 bg-destructive/5 text-destructive flex flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center"
        style={{ width: size, height: size }}
      >
        <TriangleAlert className="size-5" />
        <span className="text-xs leading-tight">
          Não foi possível gerar o QR.
          {fallbackLabel && (
            <>
              {" "}
              Use o código <strong className="font-mono">{fallbackLabel}</strong>.
            </>
          )}
        </span>
      </div>
    );
  }

  if (!dataUrl) {
    return <Skeleton className="rounded-xl" style={{ width: size, height: size }} />;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- é data URL PNG; next/image não trata */}
      <img
        src={dataUrl}
        alt={alt}
        className="rounded-xl bg-white p-2"
        style={{ width: size, height: size }}
        width={size}
        height={size}
      />
      {showDownload && (
        <a
          href={dataUrl}
          download={fileName}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs underline underline-offset-2"
        >
          <Download className="size-3.5" />
          Baixar QR
        </a>
      )}
    </div>
  );
}
