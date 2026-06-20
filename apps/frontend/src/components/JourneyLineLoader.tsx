"use client";

import dynamic from "next/dynamic";
import type { JourneySegment } from "./JourneyLine";

/**
 * Wrapper qui charge JourneyLine uniquement côté client.
 * JourneyLine utilise `window.L` (exposé par MapComponent via onMapReady),
 * donc il ne peut pas être rendu côté serveur.
 */
const JourneyLine = dynamic(() => import("./JourneyLine"), {
  ssr: false,
  loading: () => null,
});

export interface JourneyLineLoaderProps {
  map: unknown;
  segments: JourneySegment[];
  duration?: number;
  animateDash?: boolean;
}

export default function JourneyLineLoader(props: JourneyLineLoaderProps) {
  return <JourneyLine {...props} />;
}