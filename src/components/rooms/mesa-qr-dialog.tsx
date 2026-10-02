"use client";

import { QrCode, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RoomQr } from "@/components/rooms/room-qr";
import { mesaJoinUrl } from "@/lib/bars/qr";
import { useClientOrigin } from "@/lib/use-client-origin";

type MesaQrDialogProps = {
  barCode: string;
  barNome: string;
  quantidadeMesas: number;
};

export function MesaQrDialog({ barCode, barNome, quantidadeMesas }: MesaQrDialogProps) {
  // `null` até o effect rodar: aí os QRs caem na env, que no servidor é a URL
  // certa mesmo. Depois troca para o host que a TV está vendo.
  const origin = useClientOrigin();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <QrCode className="size-4" />
          QR das mesas ({quantidadeMesas})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="size-4" />
            QR das mesas · {barNome}
          </DialogTitle>
          <DialogDescription>
            Cada QR leva direto à mesa correspondente. Imprima e fixe nas mesas.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="divide-border flex flex-col divide-y">
            {Array.from({ length: quantidadeMesas }, (_, i) => i + 1).map((n) => (
              <div key={n} className="flex flex-col items-center gap-2 py-4 first:pt-0">
                <span className="bg-secondary text-secondary-foreground rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                  Mesa {n}
                </span>
                <RoomQr
                  value={mesaJoinUrl(barCode, n, origin)}
                  alt={`QR da mesa ${n} do bar ${barNome}`}
                  fileName={`qr-mesa-${n}-${barCode}.png`}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
