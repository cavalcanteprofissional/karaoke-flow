"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Info, LoaderCircle, MapPin, RotateCcw, Ruler, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { updateBarRadiusAction } from "@/lib/bars/actions";
import { barRadiusSchema } from "@/lib/bars/schema";
import {
  RAIO_MAX_METROS,
  RAIO_MIN_METROS,
  RAIO_PADRAO_METROS,
  RAIO_PASSO_METROS,
} from "@/types/bar";

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

const DEBOUNCE_MS = 500;

export type PresenceGateInfoProps = {
  barId: string;
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

/** Ajusta ao passo do controle (50 m) e mantém dentro da faixa 50–1000 m. */
function snapRadius(value: number): number {
  const stepped = Math.round(value / RAIO_PASSO_METROS) * RAIO_PASSO_METROS;
  return Math.min(RAIO_MAX_METROS, Math.max(RAIO_MIN_METROS, stepped));
}

/**
 * Aviso do gate de presença + raio configurável pelo host (2026-09-25/26; copy
 * revisada em 2026-10-03).
 *
 * O gate vale nos **dois** modos de entrada, mas com a regra de 2026-10-02 ele
 * não bloqueia mais quem está longe: **entra para assistir**, sem mesa e sem
 * poder pedir música. O que bloqueia é a **falta de consentimento** (sem
 * coordenada não dá para saber onde a pessoa está), e é isso que o texto abaixo
 * diz — a versão anterior prometia "entrada bloqueada" para quem estava fora do
 * raio, que é o contrário do que o produto faz.
 *
 * O campo é o **mesmo número** que o servidor cobra (`bars.raio_permitido_metros`,
 * validado em `checkPresence`/`requirePresence`): o host arrasta, o mapa e o
 * aviso acompanham na hora (prévia) e a gravação acontece no commit do
 * controle, com rollback se o banco recusar.
 */
export function PresenceGateInfo({
  barId,
  barName,
  address,
  city,
  latitude,
  longitude,
  radiusMeters,
  entryModeApproval,
}: PresenceGateInfoProps) {
  const [radius, setRadius] = useState(radiusMeters);
  const [inputValue, setInputValue] = useState(String(radiusMeters));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [savedRadius, setSavedRadiusState] = useState(radiusMeters);
  const savedRef = useRef(radiusMeters);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasLocation = latitude !== null && longitude !== null;
  const where = [address, city].filter(Boolean).join(", ");
  const dirty = radius !== savedRadius;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Último raio confirmado pelo banco (render usa estado, o async usa o ref). */
  const setSavedRadius = useCallback((value: number) => {
    savedRef.current = value;
    setSavedRadiusState(value);
  }, []);

  const persist = useCallback(
    async (next: number) => {
      setSaving(true);
      setFieldError(null);
      const result = await updateBarRadiusAction(barId, next);
      setSaving(false);
      if (!result.ok) {
        // Volta ao último valor confirmado pelo banco.
        setRadius(savedRef.current);
        setInputValue(String(savedRef.current));
        setFieldError(result.error);
        toast.error(result.error);
        return;
      }
      setSavedRadius(result.radiusMeters);
      setRadius(result.radiusMeters);
      setInputValue(String(result.radiusMeters));
      setSavedAt(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      );
    },
    [barId, setSavedRadius]
  );

  const schedule = useCallback(
    (next: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (next !== savedRef.current) void persist(next);
      }, DEBOUNCE_MS);
    },
    [persist]
  );

  function applyRadius(next: number, options: { commit?: boolean } = {}) {
    const snapped = snapRadius(next);
    setRadius(snapped);
    setInputValue(String(snapped));
    setFieldError(null);
    if (options.commit) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (snapped !== savedRef.current) void persist(snapped);
      return;
    }
    if (snapped !== savedRef.current) schedule(snapped);
  }

  function handleInputChange(value: string) {
    setInputValue(value);
    const parsed = barRadiusSchema.safeParse(value);
    if (!parsed.success) {
      setFieldError(parsed.error.errors[0]?.message ?? "Raio inválido.");
      return;
    }
    setFieldError(null);
    setRadius(parsed.data);
    if (parsed.data !== savedRef.current) schedule(parsed.data);
  }

  function handleInputCommit() {
    if (!barRadiusSchema.safeParse(inputValue).success) {
      setRadius(savedRef.current);
      setInputValue(String(savedRef.current));
      return;
    }
    applyRadius(Number(inputValue), { commit: true });
  }

  function statusText() {
    if (saving) return "Salvando…";
    if (fieldError) return "Não foi possível salvar";
    if (dirty) return "Ajuste para salvar";
    if (savedAt) return `Salvo às ${savedAt}`;
    return "Valor em vigor no gate";
  }

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
                ligada, quem está fora de {radius} m do bar ainda pode entrar —{" "}
                <strong className="text-foreground">só assistindo</strong>: sem mesa e sem
                pedir música.
              </>
            ) : (
              <>
                Com <strong className="text-foreground">entrada livre</strong> ligada o
                guest entra direto na sala.{" "}
                <strong className="text-foreground">
                  O gate de localização continua valendo
                </strong>
                : dentro de {radius} m ele pede música normalmente; fora do raio,{" "}
                <strong className="text-foreground">assiste sem pedir</strong>. Quem ainda
                não aceitou a localização é bloqueado — sem a coordenada não dá para saber
                onde a pessoa está.
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
              radiusMeters={radius}
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="presence-radius" className="text-xs">
              Raio de presença
            </Label>
            <span
              role="status"
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              {saving ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : fieldError ? (
                <TriangleAlert className="size-3 text-amber-500" />
              ) : dirty ? (
                <Ruler className="size-3" />
              ) : (
                <Check className="size-3 text-emerald-500" />
              )}
              {statusText()}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Slider
              value={[radius]}
              min={RAIO_MIN_METROS}
              max={RAIO_MAX_METROS}
              step={RAIO_PASSO_METROS}
              thumbAriaLabel="Ajustar raio de presença"
              onValueChange={(value) => applyRadius(value[0] ?? radius)}
              onValueCommit={(value) => applyRadius(value[0] ?? radius, { commit: true })}
            />
            <div className="flex items-center gap-1">
              <Input
                id="presence-radius"
                type="number"
                inputMode="numeric"
                min={RAIO_MIN_METROS}
                max={RAIO_MAX_METROS}
                step={RAIO_PASSO_METROS}
                value={inputValue}
                onChange={(event) => handleInputChange(event.target.value)}
                onBlur={handleInputCommit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleInputCommit();
                }}
                className="w-24"
                aria-invalid={fieldError ? true : undefined}
              />
              <span className="text-muted-foreground text-sm">m</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyRadius(RAIO_PADRAO_METROS, { commit: true })}
              disabled={saving || radius === RAIO_PADRAO_METROS}
            >
              <RotateCcw className="size-3.5" />
              Restaurar {RAIO_PADRAO_METROS} m
            </Button>
          </div>

          {fieldError ? (
            <p role="alert" className="text-xs text-amber-500">
              {fieldError}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Entre {RAIO_MIN_METROS} e {RAIO_MAX_METROS} m, de {RAIO_PASSO_METROS} em{" "}
              {RAIO_PASSO_METROS} m. Vale para todas as salas deste bar — é este número
              que o servidor compara com a localização de quem pede música.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
