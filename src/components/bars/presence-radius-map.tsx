"use client";

import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";

export type PresenceRadiusMapProps = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  barName: string;
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
 * Camadas de HUD/sprites de animação podem ser sobrepostas ao `MapContainer`
 * pelo chamador (o wrapper é relativo ao mapa).
 */
export function PresenceRadiusMap({
  latitude,
  longitude,
  radiusMeters,
  barName,
}: PresenceRadiusMapProps) {
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
        <FitRadius
          latitude={latitude}
          longitude={longitude}
          radiusMeters={radiusMeters}
        />
      </MapContainer>
      <span className="bg-background/90 text-foreground pointer-events-none absolute top-2 left-2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm">
        {radiusMeters} m a partir do bar
      </span>
    </div>
  );
}

export default PresenceRadiusMap;
