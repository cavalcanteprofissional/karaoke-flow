"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MapPin } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { hasConsent } from "@/lib/consent/cookies";
import { captureGeolocation, writeGeoCookie } from "@/lib/consent/geo";

type LocationGateProps = {
  error: string;
};

/** Bloqueio do gate de presença física: explica e oferece "Permitir localização".
 * Recaptura o GPS, grava o cookie e faz refresh — o servidor reavalia na hora. */
export function LocationGate({ error }: LocationGateProps) {
  const router = useRouter();
  const [permitindo, setPermitindo] = useState(false);

  async function permitirLocalizacao() {
    if (!hasConsent()) {
      toast.error("Aceite os cookies de consentimento para liberar a localização.");
      return;
    }
    setPermitindo(true);
    const geo = await captureGeolocation();
    writeGeoCookie(geo);
    setPermitindo(false);
    if (geo.status === "granted") {
      toast.success("Localização liberada. Agora é só entrar!");
      router.refresh();
    } else if (geo.status === "denied") {
      toast.error(
        "Localização negada no navegador. Libere nas configurações e tente de novo."
      );
    } else {
      toast.error("Não foi possível obter sua localização. Verifique o GPS.");
    }
  }

  return (
    <div className="text-destructive border-destructive/30 bg-destructive/10 flex flex-col gap-3 rounded-lg border p-3">
      <p className="flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0" />
        {error} Para proteger a casa, é preciso confirmar que você está no
        estabelecimento.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={permitirLocalizacao}
        disabled={permitindo}
        className="self-start"
      >
        {permitindo ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <MapPin className="size-4" />
        )}
        Permitir localização
      </Button>
    </div>
  );
}
