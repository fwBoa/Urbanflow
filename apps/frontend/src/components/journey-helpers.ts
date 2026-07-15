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

interface RawSegmentBase {
  mode: string;
  label?: string;
  color: string;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
}

interface RawSegmentWithPoints extends RawSegmentBase {
  points: Array<[number, number]>;
}

interface RawSegmentWithEndpoints extends RawSegmentBase {
  points?: undefined;
}

type RawSegment = RawSegmentWithPoints | RawSegmentWithEndpoints;

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
  destLon: number,
): JourneySegmentForMap[] {
  const raw: RawSegment[] = journey.segments.map((seg) => {
    const mode = (seg.mode || seg.type || "marche").toLowerCase();
    const color = seg.lineColor || MODE_COLORS[mode] || "#2E7D9B";

    // Géométrie réelle embarquée (Navitia geojson [lon, lat]) : on trace la vraie
    // trajectoire et on court-circuite le repli lignes droites / lazy-load /shape.
    if (seg.geojson && seg.geojson.length >= 2) {
      const points = seg.geojson
        .map((c) => [c[1], c[0]] as [number, number]) // [lon, lat] → [lat, lon]
        .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
      if (points.length >= 2) {
        return {
          mode,
          label: seg.lineName,
          color,
          points,
          fromLat: seg.fromLat,
          fromLon: seg.fromLon,
          toLat: seg.toLat,
          toLon: seg.toLon,
        };
      }
    }

    return {
      mode,
      label: seg.lineName,
      color,
      fromLat: seg.fromLat,
      fromLon: seg.fromLon,
      toLat: seg.toLat,
      toLon: seg.toLon,
    };
  });

  // Résolution des extrémités : chaque segment sans from/to emprunte
  // l'extrémité du segment voisin (origine/destination globales aux bouts).
  // Évite que les lignes droites intermédiaires convergent toutes vers la destination finale.
  const endpointOf = (
    seg: RawSegment,
    which: "first" | "last",
  ): { lat: number; lon: number } | null => {
    if (seg.points && seg.points.length > 0) {
      const p = which === "first" ? seg.points[0] : seg.points[seg.points.length - 1];
      return { lat: p[0], lon: p[1] };
    }
    const lat = which === "first" ? seg.fromLat : seg.toLat;
    const lon = which === "first" ? seg.fromLon : seg.toLon;
    if (typeof lat === "number" && typeof lon === "number") {
      return { lat, lon };
    }
    return null;
  };

  const froms: Array<{ lat: number; lon: number } | null> = [];
  const tos: Array<{ lat: number; lon: number } | null> = [];

  for (let i = 0; i < raw.length; i++) {
    froms.push(endpointOf(raw[i], "first"));
    tos.push(endpointOf(raw[i], "last"));
  }

  // Propagation des extrémités manquantes vers les voisins.
  // Forward : le from d'un segment = le to du précédent s'il manque.
  for (let i = 1; i < raw.length; i++) {
    if (!froms[i]) froms[i] = tos[i - 1];
  }
  // Backward : le to d'un segment = le from du suivant s'il manque.
  for (let i = raw.length - 2; i >= 0; i--) {
    if (!tos[i]) tos[i] = froms[i + 1];
  }
  // Bords : origine/destination.
  if (!froms[0]) froms[0] = { lat: originLat, lon: originLon };
  if (raw.length > 0 && !tos[raw.length - 1]) {
    tos[raw.length - 1] = { lat: destLat, lon: destLon };
  }

  const segments: JourneySegmentForMap[] = [];
  for (let i = 0; i < raw.length; i++) {
    const seg = raw[i];
    if (seg.points && seg.points.length >= 2) {
      segments.push({
        mode: seg.mode,
        label: seg.label,
        color: seg.color,
        points: seg.points,
        dashed: seg.mode === "marche",
      });
      continue;
    }

    const from = froms[i];
    const to = tos[i];
    if (!from || !to) continue;
    if (from.lat === to.lat && from.lon === to.lon) continue;

    segments.push({
      mode: seg.mode,
      label: seg.label,
      color: seg.color,
      points: [
        [from.lat, from.lon],
        [to.lat, to.lon],
      ],
      dashed: seg.mode === "marche",
    });
  }

  return segments;
}
