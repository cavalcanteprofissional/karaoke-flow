"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { CameraOff, LoaderCircle, ScanLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractRoomCodeFromQr } from "@/lib/rooms/utils";

type QrScannerProps = {
  onResult: (token: string) => void;
  triggerLabel?: string;
  /** Extrai o token do texto lido (padrão: QR de sala legado `?code=`). */
  match?: (text: string) => string | null;
};

type ScannerControls = { stop: () => void };

/**
 * Traduz a falha de câmera para uma mensagem acionável. O mesmo `catch` cobria
 * tudo com "verifique a permissão" (item 4 da validação no aparelho): negar a
 * câmera, não ter câmera e a câmera em uso pedem ações diferentes.
 */
function cameraErrorMessage(error: unknown): string {
  const name =
    error instanceof DOMException
      ? error.name
      : (error as { name?: string } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permita o acesso à câmera no navegador para escanear.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Não encontramos uma câmera neste aparelho.";
    case "NotReadableError":
    case "AbortError":
      return "A câmera está em uso por outro app. Feche-o e tente de novo.";
    default:
      return "Não foi possível abrir a câmera. Digite o código.";
  }
}

/**
 * Leitor de QR pela câmera (Fase 15/17).
 *
 * O ciclo de vida é o ponto delicado (item 4 da validação no aparelho): a
 * câmera não pode ser aberta de novo a cada render, e o `MediaStream` precisa
 * parar quando o diálogo fecha — senão a segunda abertura falha com
 * `NotReadableError` porque o stream anterior ficou preso. Por isso `onResult`
 * e `match` moram em refs (mudam de identidade a cada render do pai e não
 * justificam reabrir a câmera) e o `stop()` é sempre chamado no cleanup.
 */
export function QrScanner({
  onResult,
  triggerLabel = "Escanear QR",
  match = extractRoomCodeFromQr,
}: QrScannerProps) {
  const [open, setOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // `ready` liga quando o leitor começou de fato; a derivação de `opening` a
  // partir dele evita `setState` síncrono no corpo do efeito (o que a regra
  // `react-hooks/set-state-in-effect` barra e causaria renders em cascata).
  const [ready, setReady] = useState(false);
  // O `<video>` é montado pelo `DialogContent` (Radix) só DEPOIS do primeiro
  // commit com `open=true`, então um `videoRef.current` lido num efeito que
  // dependa só de `open` chega `null` e a câmera nunca abre. Um ref de callback
  // em estado garante que o efeito rode de novo quando o nó realmente existe.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const onResultRef = useRef(onResult);
  const matchRef = useRef(match);

  // Atualizar os refs por efeito (e não durante o render) é a forma que as
  // regras de hooks aceitam; o callback do zxing lê o valor mais recente.
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  // Navegador sem `getUserMedia` (ou jsdom): o erro é derivado, não gravado
  // por `setState` dentro do efeito.
  const cameraUnsupported =
    typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia;
  const errorMessage =
    cameraError ??
    (cameraUnsupported ? "Este navegador não dá acesso à câmera. Digite o código." : null);
  const opening = open && !ready && !errorMessage;

  useEffect(() => {
    if (!open || !videoEl || cameraUnsupported) return;

    let cancelled = false;
    let controls: ScannerControls | null = null;
    const reader = new BrowserQRCodeReader();

    reader
      .decodeFromVideoDevice(undefined, videoEl, (result, _error, scannerControls) => {
        if (!result) return;
        const token = matchRef.current(result.getText());
        if (!token) {
          toast.error("QR não reconhecido.", {
            description: "Tente digitar o código do bar ou da casa.",
          });
          return;
        }
        scannerControls.stop();
        controls = null;
        setOpen(false);
        onResultRef.current(token);
      })
      .then((scannerControls) => {
        if (cancelled) {
          scannerControls.stop();
          return;
        }
        controls = scannerControls;
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = cameraErrorMessage(error);
        setCameraError(message);
        toast.error("Não foi possível abrir a câmera.", { description: message });
      });

    return () => {
      cancelled = true;
      controls?.stop();
      controls = null;
    };
  }, [open, videoEl, cameraUnsupported]);

  function openDialog() {
    setCameraError(null);
    setReady(false);
    setOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCameraError(null);
      setReady(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button type="button" variant="outline" onClick={openDialog} className="flex-1">
        <ScanLine className="size-4" />
        {triggerLabel}
      </Button>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Escanear o QR da casa</DialogTitle>
          <DialogDescription>
            Aponte a câmera para o QR do cartaz ou da tela. A entrada é automática.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-black">
          <video ref={setVideoEl} muted playsInline className="size-full object-cover" />
          {opening && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-center">
              <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
              <p className="text-muted-foreground text-sm">Abrindo a câmera…</p>
            </div>
          )}
          {errorMessage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center">
              <CameraOff className="text-muted-foreground size-8" />
              <p className="text-muted-foreground text-sm">{errorMessage}</p>
            </div>
          )}
        </div>

        <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
