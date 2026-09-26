"use client";

import "leaflet/dist/leaflet.css";

import { useCallback, useEffect, useState } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";

import { radiusTicks, radiusTickStep } from "@/lib/bars/geo";

export type PresenceRadiusMapProps = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  barName: string;
};

/** Geometria do bar em pixels do container do mapa (base dos sprites). */
type MapGeometry = {
  /** Centro do bar em pixels, relativo ao container. */
  center: { x: number; y: number };
  /** Quantos metros o mapa cobre por pixel na latitude do bar. */
  metersPerPixel: number;
};

/**
 * Enquadra o mapa no raio sempre que ele muda (ou a posição do bar) — é o que
 * faz o círculo acompanhar em tempo real a configuração do host.
 */
function FitRadius({
  latitude,
  longitude,
  radiusMeters,
}: Omit<PresenceRadiusMapProps, "barName">) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLng(latitude, longitude).toBounds(radiusMeters * 2);
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, latitude, longitude, radiusMeters]);

  return null;
}

/** Metros por pixel na latitude do bar, usando a escala do próprio Leaflet. */
function measureMetersPerPixel(map: L.Map, latlng: L.LatLng): number {
  const center = map.latLngToContainerPoint(latlng);
  const edge = map.containerPointToLatLng(L.point(center.x + 100, center.y));
  const meters = map.distance(latlng, edge);
  return meters > 0 ? meters / 100 : 0;
}

/**
 * Publica a geometria do bar para as camadas sobrepostas do wrapper (sprites de
 * círculo por metragem). Roda dentro do `MapContainer` porque precisa da escala
 * do mapa, que muda a cada pan/zoom/resize.
 */
function RadiusGeometry({
  latitude,
  longitude,
  radiusMeters,
  onChange,
}: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (geometry: MapGeometry | null) => void;
}) {
  const map = useMap();

  const publish = useCallback(() => {
    const latlng = L.latLng(latitude, longitude);
    const point = map.latLngToContainerPoint(latlng);
    const metersPerPixel = measureMetersPerPixel(map, latlng);
    if (!Number.isFinite(point.x) || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
      onChange(null);
      return;
    }
    onChange({ center: { x: point.x, y: point.y }, metersPerPixel });
  }, [map, latitude, longitude, onChange]);

  // Depois do `FitRadius` (declarado antes): reenquadra e já mede a escala nova.
  useEffect(() => {
    publish();
  }, [publish, radiusMeters]);

  useEffect(() => {
    map.on("move zoom resize", publish);
    return () => {
      map.off("move zoom resize", publish);
    };
  }, [map, publish]);

  return null;
}

/**
 * Anéis de metragem desenhados sobre o mapa (sprites). São camadas DOM no
 * wrapper relativo — `pointer-events-none` para não roubar o pan/zoom — e cada
 * anel pulsa para dar leitura de "distância" mesmo sem rótulo.
 */
function RadiusSprites({ geometry, radiusMeters }: { geometry: MapGeometry; radiusMeters: number }) {
  const ticks = radiusTicks(radiusMeters);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {ticks.map((meters, index) => {
        const diameterPx = (meters / geometry.metersPerPixel) * 2;
        if (!Number.isFinite(diameterPx) || diameterPx < 4 || diameterPx > 8000) return null;
        return (
          <span
            key={meters}
            className="radius-sprite absolute rounded-full border border-blue-400/45 bg-blue-500/5"
            style={
              {
                width: `${diameterPx}px`,
                height: `${diameterPx}px`,
                left: geometry.center.x - diameterPx / 2,
                top: geometry.center.y - diameterPx / 2,
                "--radius-ping-delay": `${index * 400}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Mapa do raio de presença do bar (Leaflet + tiles do OpenStreetMap — sem
 * chave de API e sem custo).
 *
 * Por que não o Google Maps Embed (2026-09-25): o SKU "Embed" é gratuito e
 * ilimitado, mas exige **API key + billing habilitado** e, principalmente, é um
 * `iframe` que não aceita círculo/overlay nem update in-place — o raio mudaria
 * só recarregando o frame. Aqui o círculo é vetorial e reage a cada prop nova.
 *
 * A etiqueta usa `CircleMarker` em vez do `Marker` padrão: o ícone default do
 * Leaflet depende de arquivos de imagem que não sobrevivem ao bundler do Next.
 *
 * **HUD/sprites (2026-09-26):** o wrapper é relativo e recebe duas camadas
 * sobrepostas — o HUD com a metragem e os anéis internos do raio, que acompanham
 * a prévia do host enquanto ele arrasta o controle. A chave de API do Google
 * fica reservada para um embed futuro, se ele fizer sentido.
 */
export function PresenceRadiusMap({
  latitude,
  longitude,
  radiusMeters,
  barName,
}: PresenceRadiusMapProps) {
  const [geometry, setGeometry] = useState<MapGeometry | null>(null);
  const step = radiusTickStep(radiusMeters);

  return (
    <div className="bg-muted/40 relative w-full overflow-hidden rounded-lg border">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        scrollWheelZoom={false}
        attributionControl={true}
        className="h-64 w-full"
        aria-label={`Mapa do raio de presença de ${barName}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={[latitude, longitude]}
          radius={radiusMeters}
          pathOptions={{
            color: "#2563eb",
            weight: 2,
            fillColor: "#2563eb",
            fillOpacity: 0.12,
          }}
        />
        <CircleMarker
          center={[latitude, longitude]}
          radius={7}
          pathOptions={{
            color: "#ffffff",
            weight: 3,
            fillColor: "#1d4ed8",
            fillOpacity: 1,
          }}
        />
        <FitRadius latitude={latitude} longitude={longitude} radiusMeters={radiusMeters} />
        <RadiusGeometry
          latitude={latitude}
          longitude={longitude}
          radiusMeters={radiusMeters}
          onChange={setGeometry}
        />
      </MapContainer>

      {geometry && <RadiusSprites geometry={geometry} radiusMeters={radiusMeters} />}

      <span className="bg-background/90 text-foreground pointer-events-none absolute top-2 left-2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm">
        {radiusMeters} m a partir do bar
      </span>
      <span className="bg-background/90 text-muted-foreground pointer-events-none absolute bottom-6 left-2 rounded-md border px-2 py-1 text-[11px] shadow-sm">
        anéis de {step} m
      </span>
    </div>
  );
}

export default PresenceRadiusMap;
