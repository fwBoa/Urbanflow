/**
 * Helpers purs (sans Leaflet) pour la conversion journey → segments.
 * Ce fichier ne doit PAS importer Leaflet pour éviter les erreurs SSR.
 */

import { MAP_MODE_COLORS } from "@/constants/mode-colors";

export const MODE_COLORS = MAP_MODE_COLORS;

export interface JourneySegmentForMap {
  mode: string;
  label?: string;
  color: string;
  points: Array<[number, number]>;
  weight?: number;
  dashed?: boolean;
}

/**
 * Convertit un journey (depuis l'API) en segments pour JourneyLine.
 */
export function journeyToSegments(
  journey: {
    segments: Array<{
      type: string;
      mode?: string;
      lineColor?: string;
      lineName?: string;
      fromLat?: number;
      fromLon?: number;
      toLat?: number;
      toLon?: number;
      fromStop?: string;
      toStop?: string;
      /** Géométrie réelle [lon, lat] embarquée par Navitia (sinon lignes droites). */
      geojson?: Array<[number, number]>;
    }>;
  },
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): JourneySegmentForMap[] {
  const segments: JourneySegmentForMap[] = [];

  journey.segments.forEach((seg) => {
    const mode = (seg.mode || seg.type || "marche").toLowerCase();
    const color = seg.lineColor || MODE_COLORS[mode] || "#2E7D9B";

    // Géométrie réelle embarquée (Navitia geojson [lon, lat]) : on trace la vraie
    // trajectoire et on court-circuite le repli lignes droites / lazy-load /shape.
    if (seg.geojson && seg.geojson.length >= 2) {
      const points = seg.geojson
        .map((c) => [c[1], c[0]] as [number, number]) // [lon, lat] → [lat, lon]
        .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
      if (points.length >= 2) {
        segments.push({
          mode,
          label: seg.lineName,
          color,
          points,
          dashed: mode === "marche",
        });
      }
      return;
    }

    let fromLat: number;
    let fromLon: number;
    let toLat: number;
    let toLon: number;

    if (typeof seg.fromLat === "number" && typeof seg.fromLon === "number") {
      fromLat = seg.fromLat;
      fromLon = seg.fromLon;
    } else if (segments.length === 0) {
      fromLat = originLat;
      fromLon = originLon;
    } else {
      const last = segments[segments.length - 1].points[segments[segments.length - 1].points.length - 1];
      fromLat = last[0];
      fromLon = last[1];
    }

    if (typeof seg.toLat === "number" && typeof seg.toLon === "number") {
      toLat = seg.toLat;
      toLon = seg.toLon;
    } else if (seg === journey.segments[journey.segments.length - 1]) {
      toLat = destLat;
      toLon = destLon;
    } else {
      toLat = destLat;
      toLon = destLon;
    }

    if (fromLat === toLat && fromLon === toLon) return;

    segments.push({
      mode,
      label: seg.lineName,
      color,
      points: [
        [fromLat, fromLon],
        [toLat, toLon],
      ],
      dashed: mode === "marche",
    });
  });

  return segments;
}