"use client";

import dynamic from "next/dynamic";
import type { MapProps } from "./MapComponent";

// Ré-export des helpers purs (sans Leaflet) — safe SSR
export { journeyToSegments, MODE_COLORS } from "./journey-helpers";
export type { JourneySegmentForMap } from "./journey-helpers";

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--color-map-area)] rounded-[var(--card-radius)] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse text-[var(--color-primary)] text-2xl mb-2">🗺️</div>
        <p className="text-sm text-[var(--color-text-tertiary)]">Chargement de la carte…</p>
      </div>
    </div>
  ),
});

export default function Map(props: MapProps) {
  return <MapComponent {...props} />;
}

export type { MapProps };