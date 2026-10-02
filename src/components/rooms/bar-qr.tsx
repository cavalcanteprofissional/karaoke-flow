"use client";

import { RoomQr } from "@/components/rooms/room-qr";
import { barJoinUrl } from "@/lib/bars/qr";
import { useClientOrigin } from "@/lib/use-client-origin";

type BarQrProps = {
  barCode: string;
  barNome: string;
};

/**
 * QR do bar no painel do host — um componente client só para montar a URL.
 *
 * A página da sala é uma server component e chamava `barJoinUrl(bar.code)`
 * direto, sem origin. Como `resolveAppUrl` só consegue ver `window` no browser,
 * o servidor caía na `NEXT_PUBLIC_APP_URL` — que é **build time**: num preview
 * da Vercel o QR do bar mandava o convidado para a produção, enquanto o QR do
 * quiosque e o das mesas (que passaram pelo `useClientOrigin`) iam para o host
 * certo. Mesma armadilha, metade dos QR.
 *
 * Aqui o `origin` é `null` no servidor e na hidratação (a URL cai na env, que no
 * servidor é a URL certa mesmo) e vira o host que a TV está vendo assim que o
 * effect roda — o `RoomQr` regenera sozinho porque carrega o `value` que gerou
 * cada resultado.
 */
export function BarQr({ barCode, barNome }: BarQrProps) {
  const origin = useClientOrigin();

  return (
    <RoomQr
      value={barJoinUrl(barCode, origin)}
      alt={`QR do bar ${barNome}`}
      fileName={`qr-bar-${barCode}.png`}
    />
  );
}
