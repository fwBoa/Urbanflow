"use client";

import { useEffect, useRef } from "react";

/**
 * Un segment = un tronçon du trajet (marche, métro, bus, etc.)
 * Chaque segment a sa propre couleur officielle (IDFM) et ses points.
 */
export interface JourneySegment {
  mode: string;
  label?: string;
  color: string;
  points: Array<[number, number]>;
  weight?: number;
  dashed?: boolean;
}

export interface JourneyLineProps {
  /** Instance Leaflet (L.Map) — reçue du parent via callback onMapReady */
  map: unknown;
  segments: JourneySegment[];
  duration?: number;
  animateDash?: boolean;
}

const WALK_DASH = "8, 10";

/**
 * Récupère L depuis window.L (exposé par MapComponent via onMapReady → useEffect).
 * Cette approche évite d'importer Leaflet dans ce fichier (sinon SSR crash).
 */
function getL(): unknown {
  if (typeof window === "undefined") return null;
  // window.L est exposé par MapComponent via onMapReady
  return (window as { L?: unknown }).L ?? null;
}

/**
 * Composant Leaflet qui trace un trajet multimodal animé, multi-couleurs.
 *
 * Reçoit l'instance `map` (L.Map) en prop + accès à `window.L` pour créer
 * les LayerGroups et polylines.
 */
export default function JourneyLine({
  map,
  segments,
  duration = 1.4,
  animateDash = true,
}: JourneyLineProps) {
  const layerGroupRef = useRef<unknown>(null);
  const animatedLinesRef = useRef<
    Array<{ line: unknown; raf: number; mode: string }>
  >([]);

  // ── Init LayerGroup quand map dispo ───────────────────────────────
  useEffect(() => {
    if (!map) return;
    const L = getL() as {
      layerGroup(): { addTo: (m: unknown) => unknown; removeLayer: (l: unknown) => void };
    } | null;
    if (!L) return;

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;

    return () => {
      animatedLinesRef.current.forEach(({ line, raf }) => {
        cancelAnimationFrame(raf);
        (map as { removeLayer: (l: unknown) => void }).removeLayer(line);
      });
      animatedLinesRef.current = [];
      (map as { removeLayer: (l: unknown) => void }).removeLayer(group);
    };
  }, [map]);

  // ── Trace les segments ────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;
    const group = layerGroupRef.current;
    if (!group) return;

    const L = getL() as {
      polyline: (
        pts: Array<[number, number]>,
        opts: Record<string, unknown>,
      ) => {
        addTo: (g: unknown) => unknown;
        setStyle: (o: Record<string, unknown>) => void;
        options?: Record<string, unknown>;
        _path?: SVGPathElement;
      };
      latLngBounds: (pts: Array<[number, number]>) => unknown;
    } | null;
    if (!L) return;

    // Cleanup
    animatedLinesRef.current.forEach(({ line, raf }) => {
      cancelAnimationFrame(raf);
      (group as { removeLayer: (l: unknown) => void }).removeLayer(line);
    });
    animatedLinesRef.current = [];

    const validSegments = segments.filter((s) => s.points.length >= 2);
    if (validSegments.length === 0) return;

    const allPoints: Array<[number, number]> = validSegments.flatMap((s) => s.points);
    if (allPoints.length >= 2) {
      try {
        const bounds = L.latLngBounds(allPoints);
        (map as { fitBounds: (b: unknown, o: unknown) => void }).fitBounds(bounds, {
          padding: [60, 60],
        });
      } catch {
        // ignore
      }
    }

    validSegments.forEach((seg, segIdx) => {
      const color = seg.color || "#2E7D9B";
      const weight = seg.weight ?? (seg.mode === "marche" ? 4 : 5);
      const isDashed = seg.dashed ?? seg.mode === "marche";
      const dashArray = isDashed ? WALK_DASH : undefined;

      // Halo
      const halo = L.polyline(seg.points, {
        color,
        weight: weight * 2.2,
        opacity: 0.2,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(group);

      // Trait principal
      const line = L.polyline(seg.points, {
        color,
        weight,
        opacity: 0.95,
        dashArray,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(group);

      const svgPath = (line as { _path?: SVGPathElement })._path;
      if (!svgPath) return;

      let length: number;
      try {
        length = svgPath.getTotalLength();
      } catch {
        return;
      }

      if (isDashed) {
        // Marche : opacité progressive puis défilement
        (halo as { setStyle: (o: Record<string, unknown>) => void }).setStyle({ opacity: 0 });
        (line as { setStyle: (o: Record<string, unknown>) => void }).setStyle({ opacity: 0 });

        const startDelay = segIdx * (duration * 0.15);
        const start = performance.now() + startDelay * 1000;
        const tick = (now: number) => {
          if (now < start) {
            requestAnimationFrame(tick);
            return;
          }
          const elapsed = (now - start) / 1000;
          const t = Math.min(elapsed / (duration * 0.6), 1);
          const eased = 1 - Math.pow(1 - t, 3);
          (halo as { setStyle: (o: Record<string, unknown>) => void }).setStyle({ opacity: 0.2 * eased });
          (line as { setStyle: (o: Record<string, unknown>) => void }).setStyle({ opacity: 0.95 * eased });
          if (t < 1) {
            requestAnimationFrame(tick);
          } else if (animateDash) {
            let phase = 0;
            const flow = () => {
              phase = (phase - 0.4) % 18;
              svgPath.style.strokeDashoffset = String(phase);
              const raf = requestAnimationFrame(flow);
              animatedLinesRef.current = animatedLinesRef.current.filter(
                (a) => !(a.line === line && a.mode === seg.mode),
              );
              animatedLinesRef.current.push({ line, raf, mode: seg.mode });
            };
            flow();
          }
        };
        requestAnimationFrame(tick);
      } else {
        // Transit : pathLength → 0
        svgPath.style.strokeDasharray = `${length}`;
        svgPath.style.strokeDashoffset = `${length}`;
        try {
          svgPath.getBoundingClientRect();
        } catch {
          // ignore
        }

        const startDelay = segIdx * (duration * 0.15);
        const start = performance.now() + startDelay * 1000;
        const tick = (now: number) => {
          if (now < start) {
            requestAnimationFrame(tick);
            return;
          }
          const elapsed = (now - start) / 1000;
          const t = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          svgPath.style.strokeDashoffset = `${length * (1 - eased)}`;
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
  }, [map, segments, duration, animateDash]);

  return null;
}