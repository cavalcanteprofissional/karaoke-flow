"use client";

import dynamic from "next/dynamic";
import { Info, Lock, MapPin, Ruler } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Leaflet só roda no browser (window/DOM no mount) — carregado sob demanda para
 * não entrar no bundle do servidor nem quebrar o SSR da página da sala.
 */
const PresenceRadiusMap = dynamic(
  () =>
    import("@/components/bars/presence-radius-map").then((mod) => mod.PresenceRadiusMap),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted/40 text-muted-foreground flex h-64 w-full items-center justify-center rounded-lg border text-sm">
        Carregando o mapa…
      </div>
    ),
  }
);

export type PresenceGateInfoProps = {
  barName: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  /** `bars.raio_permitido_metros` — o mesmo número que o gate valida no servidor. */
  radiusMeters: number;
  /** `true` quando a entrada da sala está com aprovação ligada. */
  entryModeApproval: boolean;
};

/**
 * Aviso do gate de presença + prévia do raio (2026-09-25).
 *
 * O gate vale nos **dois** modos de entrada: com `entrada livre` ligada o
 * participante entra direto, mas ainda precisa estar dentro do raio — o que a
 * tela deixa explícito, com o círculo do raio e a metragem. A personalização do
 * raio pelo host entra depois; por enquanto o campo aparece desabilitado com o
 * valor efetivo do bar.
 */
export function PresenceGateInfo({
  barName,
  address,
  city,
  latitude,
  longitude,
  radiusMeters,
  entryModeApproval,
}: PresenceGateInfoProps) {
  const hasLocation = latitude !== null && longitude !== null;
  const where = [address, city].filter(Boolean).join(", ");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="text-muted-foreground size-4" />
          Raio de presença
        </CardTitle>
        <CardDescription>
          {barName}
          {where ? ` · ${where}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="bg-muted/40 flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground">
            {entryModeApproval ? (
              <>
                Com <strong className="text-foreground">entrada com aprovação</strong>{" "}
                ligada, quem estiver fora de {radiusMeters} m do bar é bloqueado antes de
                pedir entrada.
              </>
            ) : (
              <>
                Com <strong className="text-foreground">entrada livre</strong> ligada o
                guest entra direto na sala, mas{" "}
                <strong className="text-foreground">
                  o gate de localização continua valendo
                </strong>
                : fora de {radiusMeters} m do bar, a entrada é bloqueada do mesmo jeito.
              </>
            )}{" "}
            O host nunca é bloqueado.
          </p>
        </div>

        {hasLocation ? (
          <>
            <PresenceRadiusMap
              latitude={latitude}
              longitude={longitude}
              radiusMeters={radiusMeters}
              barName={barName}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a
                className="text-muted-foreground hover:text-foreground underline underline-offset-4"
                href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no Google Maps
              </a>
              <span className="text-muted-foreground">·</span>
              <a
                className="text-muted-foreground hover:text-foreground underline underline-offset-4"
                href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no OpenStreetMap
              </a>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground bg-muted/40 flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <p>
              Este bar ainda não tem endereço geolocalizado, então o raio não pode ser
              desenhado — e, sem coordenadas do bar, o gate bloqueia a entrada de todo
              participante (o host entra normalmente). Cadastre a localização do bar para
              liberar a galera.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="presence-radius" className="text-xs">
            Raio de presença
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="presence-radius"
              readOnly
              disabled
              value={`${radiusMeters} m`}
              className="text-muted-foreground w-28"
            />
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <Lock className="size-3" />
              Personalização em breve
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            Valor em vigor no gate (padrão de {radiusMeters} m). A escolha do host entra
            em uma próxima fase.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
