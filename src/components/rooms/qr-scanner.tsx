"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { CameraOff, ScanLine } from "lucide-react";
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

export function QrScanner({
  onResult,
  triggerLabel = "Escanear QR",
  match = extractRoomCodeFromQr,
}: QrScannerProps) {
  const [open, setOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  function stopScan() {
    stopRef.current?.();
    stopRef.current = null;
  }

  useEffect(() => {
    if (!open) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setCameraError(false);
    const reader = new BrowserQRCodeReader();

    reader
      .decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
        if (!result) return;
        const token = match(result.getText());
        if (!token) {
          toast.error("QR não reconhecido.", {
            description: "Tente digitar o código do bar ou da casa.",
          });
          return;
        }
        controls.stop();
        stopRef.current = null;
        setOpen(false);
        onResult(token);
      })
      .then((controls) => {
        if (cancelled) controls.stop();
        else stopRef.current = () => controls.stop();
      })
      .catch(() => {
        if (cancelled) return;
        setCameraError(true);
        toast.error("Não foi possível abrir a câmera.", {
          description: "Verifique a permissão do navegador ou digite o código.",
        });
      });

    return () => {
      cancelled = true;
      stopRef.current = null;
    };
  }, [open, onResult, match]);

  useEffect(() => {
    if (!open) stopScan();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="flex-1"
      >
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
          <video ref={videoRef} muted playsInline className="size-full object-cover" />
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center">
              <CameraOff className="text-muted-foreground size-8" />
              <p className="text-muted-foreground text-sm">
                Câmera indisponível. Use o botão &ldquo;digitar código&rdquo;.
              </p>
            </div>
          )}
        </div>

        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
