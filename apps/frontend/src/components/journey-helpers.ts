/**
 * Helpers purs (sans Leaflet) pour la conversion journey → segments.
 * Ce fichier ne doit PAS importer Leaflet pour éviter les erreurs SSR.
 */

export const MODE_COLORS: Record<string, string> = {
  marche: "#9E9E9E",
  metro: "#003CA0",
  rer: "#E2231A",
  bus: "#FFBE00",
  tram: "#7C2880",
  velib: "#7CB342",
  train: "#6E6E6E",
  transilien: "#6E6E6E",
  ferry: "#0099CC",
  car: "#333333",
};

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