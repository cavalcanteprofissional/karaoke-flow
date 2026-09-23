"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

type RoomQrProps = {
  value: string;
  alt?: string;
  fileName?: string;
};

export function RoomQr({ value, alt = "QR da sala", fileName = "qr-sala.png" }: RoomQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (!dataUrl) return <Skeleton className="size-48 rounded-xl" />;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- é data URL PNG; next/image não trata */}
      <img
        src={dataUrl}
        alt={alt}
        className="size-48 rounded-xl bg-white p-2"
        width={192}
        height={192}
      />
      <a
        href={dataUrl}
        download={fileName}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs underline underline-offset-2"
      >
        <Download className="size-3.5" />
        Baixar QR
      </a>
    </div>
  );
}
