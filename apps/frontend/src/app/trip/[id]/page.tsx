"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pause,
  Square,
  Play,
  RotateCcw,
  Loader2,
  Volume2,
  VolumeX,
  Trophy,
  PartyPopper,
} from "lucide-react";
import ModeIcon from "@/components/ModeIcon";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";
import AppShell from "@/components/AppShell";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
import type { MapPolyline } from "@/components/MapComponent";
import { journeyToSegments } from "@/components/journey-helpers";
import ModeBadge from "@/components/ModeBadge";
import AddFavoriteLineButton from "@/components/AddFavoriteLineButton";
import TurnByTurnBanner from "@/components/TurnByTurnBanner";
import { useNavigation } from "@/hooks/useNavigation";
import { useDeviceHeading } from "@/hooks/useDeviceHeading";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { MAP_MODE_COLORS } from "@/constants/mode-colors";
import { apiService } from "@/services/api";
import type { JourneyResult } from "@/services/api";
import { Immersion } from "@/services/immersion";
import {
  addToHistory,
  addFavorite,
  removeFavorite,
  getFavorites,
  type FavoriteJourney,
} from "@/services/favorites";
import { alertMatchesLine, filterAlertsForJourney } from "@/lib/alerts";

// ─── Facteur d'émission moyen voiture particulière en France (thermique) ───
// Source : ADEME ~170 g CO₂/km (valeur conservative pour comparaison)
const CAR_EMISSION_G_PER_KM = 170;

// ─── Modes de transport en commun par défaut (exclut Vélib' sauf demande explicite) ───
const DEFAULT_TRANSIT_MODES = "metro,rer,tram,bus,transilien";

// ─── Haversine local (distance en mètres) pour le garde déplacement reroute ──
function haversinePage(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function samePlace(
  a?: { lat: number; lon: number },
  b?: { lat: number; lon: number } | null,
): boolean {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lon - b.lon) < 0.001;
}

function normalizePlaceName(s: string): string {
  return s.toLowerCase().replace(/[^\w]/g, "").trim();
}

function extractTripModes(segments: JourneyResult["segments"]): string {
  const modes = new Set<string>();
  for (const seg of segments) {
    if (seg.type === "transit") {
      const m = (seg.mode || "").toLowerCase();
      if (m.includes("rer")) modes.add("rer");
      else if (m.includes("metro") || m.includes("métro")) modes.add("metro");
      else if (m.includes("transilien") || m.includes("train")) modes.add("transilien");
      else if (m.includes("tram")) modes.add("tram");
      else if (m.includes("bus")) modes.add("bus");
    } else if (seg.type === "velib") {
      modes.add("velib");
    }
  }
  return modes.size > 0 ? [...modes].join(",") : DEFAULT_TRANSIT_MODES;
}

function favoriteMatchesTrip(
  fav: FavoriteJourney,
  departure: string,
  arrival: string,
  mode: string,
  origin?: { lat: number; lon: number } | null,
  destination?: { lat: number; lon: number } | null,
): boolean {
  if (fav.type === "line") return false;
  if (fav.mode !== mode) return false;

  // Correspondance robuste par coordonnées d'origine/destination.
  if (
    samePlace(fav.origin, origin) &&
    samePlace(fav.destination, destination)
  ) {
    return true;
  }

  // Fallback par nom (matching partiel tolérant).
  const dNorm = normalizePlaceName(departure);
  const aNorm = normalizePlaceName(arrival);
  const fdNorm = normalizePlaceName(fav.from);
  const faNorm = normalizePlaceName(fav.to);
  const fromMatch =
    fdNorm === dNorm || fdNorm.includes(dNorm) || dNorm.includes(fdNorm);
  const toMatch =
    faNorm === aNorm || faNorm.includes(aNorm) || aNorm.includes(faNorm);
  return fromMatch && toMatch;
}

function CO2Comparison({
  co2,
  distanceKm,
}: {
  co2: number;
  distanceKm?: number;
}) {
  const carEmission = Math.round((distanceKm ?? 0) * CAR_EMISSION_G_PER_KM);
  const saved = carEmission - co2;
  const percentSaved =
    carEmission > 0 ? Math.round((saved / carEmission) * 100) : 0;

  let message: string;
  if (saved <= 0) {
    message = "Empreinte comparable à la voiture pour ce trajet";
  } else if (percentSaved >= 90) {
    message = `${percentSaved}% moins de CO₂ qu'en voiture`;
  } else {
    message = `${percentSaved}% moins de CO₂ qu'en voiture`;
  }

  return (
    <div className="bg-[var(--color-eco-green)]/10 rounded-[var(--card-radius)] p-3 mb-4 border border-[var(--color-eco-green)]/20">
      <div className="flex items-center gap-2">
        <UrbanFlowIcon type="status" name="leaf" size={16} className="text-[var(--color-eco-green)] shrink-0" />
        <p className="text-sm text-[var(--color-eco-green)]">
          <span className="font-semibold">{message}</span>
          {saved > 0 && distanceKm && (
            <span className="block text-xs text-[var(--color-eco-green)]/80 mt-0.5">
              Économie réelle : {saved}g CO₂ sur {carEmission}g en voiture (
              {distanceKm.toFixed(1)} km)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Mode metadata (label FR, mode résolu) — utilisation du mapping unifié IDFM ─
function getModeInfo(
  mode?: string,
  type?: string,
): {
  label: string;
  resolvedMode: string;
  bgColor: string;
  ringColor: string;
} {
  const resolvedMode =
    type === "walking" ? "walking" : type === "velib" ? "velib" : mode;
  const t = type || "";
  if (t === "walking")
    return {
      label: "Marche",
      resolvedMode: "walking",
      bgColor: "bg-slate-100 dark:bg-slate-800",
      ringColor: "ring-slate-300",
    };
  if (t === "velib")
    return {
      label: "Vélib'",
      resolvedMode: "velib",
      bgColor: "bg-[var(--color-eco-green)]/10",
      ringColor: "ring-[var(--color-eco-green)]",
    };
  if (resolvedMode?.includes("tram"))
    return {
      label: "Tram",
      resolvedMode: resolvedMode || "tram",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      ringColor: "ring-purple-300",
    };
  if (resolvedMode?.includes("bus"))
    return {
      label: "Bus",
      resolvedMode: resolvedMode || "bus",
      bgColor: "bg-sky-100 dark:bg-sky-900/30",
      ringColor: "ring-sky-300",
    };
  if (resolvedMode?.includes("rer"))
    return {
      label: "RER",
      resolvedMode: resolvedMode || "rer",
      bgColor: "bg-pink-100 dark:bg-pink-900/30",
      ringColor: "ring-pink-300",
    };
  if (resolvedMode?.includes("metro") || resolvedMode?.includes("métro"))
    return {
      label: "Métro",
      resolvedMode: resolvedMode || "metro",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      ringColor: "ring-blue-300",
    };
  if (resolvedMode?.includes("transilien") || resolvedMode?.includes("train"))
    return {
      label: "Train",
      resolvedMode: resolvedMode || "train",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      ringColor: "ring-indigo-300",
    };
  return {
    label: "Transit",
    resolvedMode: resolvedMode || "transit",
    bgColor: "bg-slate-100",
    ringColor: "ring-slate-300",
  };
}

// Fallback data when no journey data is passed
const fallbackTrip = {
  departure: "Châtelet",
  arrival: "La Défense",
  duration: "22 min",
  co2: 32,
  transfers: 0,
  segments: [
    {
      type: "walking" as const,
      mode: "marche",
      from: "Votre position",
      to: "Châtelet",
      fromStop: "Votre position",
      toStop: "Châtelet",
      durationMinutes: 3,
      distanceKm: 0.2,
      instruction: "Marcher jusqu'à Châtelet (200m)",
    },
    {
      type: "transit" as const,
      mode: "RER A",
      lineName: "RER A",
      lineColor: MAP_MODE_COLORS.rer,
      from: "Châtelet",
      to: "La Défense",
      fromStop: "Châtelet",
      toStop: "La Défense",
      durationMinutes: 18,
      numStops: 4,
      instruction: "Prendre RER A de Châtelet à La Défense",
    },
    {
      type: "walking" as const,
      mode: "marche",
      from: "La Défense",
      to: "Destination",
      fromStop: "La Défense",
      toStop: "Destination",
      durationMinutes: 1,
      distanceKm: 0.1,
      instruction: "Marcher jusqu'à destination (100m)",
    },
  ],
};

export default function TripDetailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const reducedMotion = usePrefersReducedMotion();
  const tripId = typeof params.id === "string" ? params.id : null;

  // ─── Trip : state (init depuis sessionStorage puis fallback sur `data` URL) ──
  // Coordonnées présentes dans l'URL pour recalcul éventuel
  const originLatParam = searchParams.get("originLat");
  const originLonParam = searchParams.get("originLon");
  const destLatParam = searchParams.get("destLat");
  const destLonParam = searchParams.get("destLon");
  const hasRecalcCoords =
    !!originLatParam && !!originLonParam && !!destLatParam && !!destLonParam;

  const [trip, setTrip] = useState<JourneyResult | null>(() => {
    try {
      if (typeof window === "undefined" || !tripId) return null;
      // Kaizen : les données volumineuses sont stockées en sessionStorage pour
      // éviter les URLs de plusieurs dizaines de ko qui cassent les proxies/navigateurs.
      const stored = sessionStorage.getItem(`uf:trip:${tripId}`);
      if (stored) return JSON.parse(stored);
      // Fallback legacy (liens partagés/bookmarks)
      const data = searchParams.get("data");
      if (data) return JSON.parse(decodeURIComponent(data));
    } catch {
      // Use fallback
    }
    return null;
  });

  // ─── Segments de timeline dont les alertes sont dépliées ─────────────
  const [expandedAlertSegments, setExpandedAlertSegments] = useState<
    Set<number>
  >(new Set());

  // ─── Voix de navigation (toggle persistant) ──────────────────────────
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try {
      return (
        typeof window === "undefined" ||
        localStorage.getItem("uf:voice") !== "false"
      );
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("uf:voice", String(voiceEnabled));
    } catch {
      // ignore
    }
  }, [voiceEnabled]);

  // ─── Écran de succès à l'arrivée ─────────────────────────────────────
  const [showSuccess, setShowSuccess] = useState(false);

  // Le recalcul est automatiquement en cours si on n'a pas de trip mais qu'on a les coords.
  const [recalcDone, setRecalcDone] = useState(false);
  const tripLoading = !trip && hasRecalcCoords && !recalcDone;

  // ─── Recalcul du trajet si sessionStorage est vide (refresh, nouvel onglet) ──
  useEffect(() => {
    if (trip || !hasRecalcCoords) return;

    let cancelled = false;
    const controller = new AbortController();
    apiService
      .searchJourney(
        {
          originLat: parseFloat(originLatParam!),
          originLon: parseFloat(originLonParam!),
          destLat: parseFloat(destLatParam!),
          destLon: parseFloat(destLonParam!),
          modes: DEFAULT_TRANSIT_MODES,
        },
        controller.signal,
      )
      .then((results) => {
        if (cancelled || controller.signal.aborted) return;
        const best = results[0];
        if (!best) return;
        setTrip(best);
        try {
          if (tripId)
            sessionStorage.setItem(`uf:trip:${tripId}`, JSON.stringify(best));
        } catch {
          // best-effort
        }
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        console.warn("Trip recalculation failed:", err);
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) setRecalcDone(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    trip,
    searchParams,
    tripId,
    hasRecalcCoords,
    originLatParam,
    originLonParam,
    destLatParam,
    destLonParam,
  ]);

  const segments = (trip?.segments ||
    fallbackTrip.segments) as JourneyResult["segments"];
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  // Vrai nom de l'arrêt de départ : toStop du 1er walking, ou fromStop du 1er transit
  const realDeparture =
    firstSeg?.type === "walking"
      ? (firstSeg.toStop ?? firstSeg.fromStop)
      : firstSeg?.fromStop;
  // Vrai nom de l'arrêt d'arrivée : fromStop du dernier walking, ou toStop du dernier transit
  const realArrival =
    lastSeg?.type === "walking"
      ? (lastSeg.fromStop ?? lastSeg.toStop)
      : lastSeg?.toStop;
  const departure =
    realDeparture ?? firstSeg?.instruction?.split(" ").slice(-1)[0] ?? "Départ";
  const arrival =
    realArrival ?? lastSeg?.instruction?.split(" ").slice(-1)[0] ?? "Arrivée";
  const duration = trip ? `${trip.durationMinutes} min` : fallbackTrip.duration;
  const co2 = trip?.co2Ggrams || fallbackTrip.co2;
  const transfers = trip?.transfers ?? fallbackTrip.transfers;

  const mainTransitSegment = segments.find((s) => s.type === "transit");
  const historyMode =
    mainTransitSegment?.mode || segments[0]?.mode || "walking";
  const historyModeColor = mainTransitSegment?.lineColor || "#2E7D9B";

  // ─── Coordinates from search page ────────────────────────────────────
  const originLat = searchParams.get("originLat");
  const originLon = searchParams.get("originLon");
  const destLat = searchParams.get("destLat");
  const destLon = searchParams.get("destLon");

  const hasCoords = originLat && originLon && destLat && destLon;
  // ─── Origin en state : reroutage remplace l'origine par la position user ──
  const [originPos, setOriginPos] = useState<{
    lat: number;
    lon: number;
  } | null>(() =>
    hasCoords
      ? { lat: parseFloat(originLat!), lon: parseFloat(originLon!) }
      : null,
  );
  const destPos = useMemo(
    () =>
      hasCoords
        ? { lat: parseFloat(destLat!), lon: parseFloat(destLon!) }
        : null,
    [destLat, destLon, hasCoords],
  );

  // Modes utilisés dans le trajet initial, pour recalcul/reroute cohérent
  const tripModes = useMemo(() => extractTripModes(segments), [segments]);

  // ─── Favori : état ─────────────────────────────────────────────────
  const [isFavoriteState, setIsFavoriteState] = useState<boolean>(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    getFavorites()
      .then((favs) => {
        if (cancelled) return;
        const match = favs.find((f) =>
          favoriteMatchesTrip(
            f,
            departure,
            arrival,
            historyMode,
            originPos,
            destPos,
          ),
        );
        setIsFavoriteState(!!match);
        setFavoriteId(match?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setIsFavoriteState(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trip, departure, arrival, historyMode, originPos, destPos]);

  // ─── Favori : toggle (déclaré après originPos/destPos) ───────────────
  const toggleFavorite = useCallback(async () => {
    if (!trip || favoriteLoading) return;
    setFavoriteLoading(true);
    try {
      if (isFavoriteState && favoriteId) {
        const updated = await removeFavorite(favoriteId);
        setIsFavoriteState(false);
        setFavoriteId(null);
        const stillThere = updated.some((f) =>
          favoriteMatchesTrip(
            f,
            departure,
            arrival,
            historyMode,
            originPos,
            destPos,
          ),
        );
        if (stillThere) {
          const match = updated.find((f) =>
            favoriteMatchesTrip(
              f,
              departure,
              arrival,
              historyMode,
              originPos,
              destPos,
            ),
          );
          setFavoriteId(match?.id ?? null);
        }
      } else {
        const fav = await addFavorite({
          from: departure,
          to: arrival,
          mode: historyMode,
          modeColor: historyModeColor,
          duration,
          departureTime: trip.departureTime,
          co2,
          origin: originPos ?? undefined,
          destination: destPos ?? undefined,
        });
        setIsFavoriteState(true);
        setFavoriteId(fav.id);
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    } finally {
      setFavoriteLoading(false);
    }
  }, [
    trip,
    favoriteLoading,
    isFavoriteState,
    favoriteId,
    departure,
    arrival,
    historyMode,
    historyModeColor,
    duration,
    co2,
    originPos,
    destPos,
  ]);

  // ─── Alertes temps réel sur ce trajet ────────────────────────────────
  const alerts = useMemo(() => trip?.alerts || [], [trip?.alerts]);

  /** Alertes qui concernent explicitement une ligne empruntée par ce trajet. */
  const relevantAlerts = useMemo(() => {
    if (!trip) return [];
    const transitSegments = segments.filter((s) => s.type === "transit");
    const transitLines = transitSegments.map((s) => s.lineName || s.mode || "");
    const transitModes = transitSegments.map((s) => s.mode || "");
    return filterAlertsForJourney(alerts, transitLines, transitModes);
  }, [trip, segments, alerts]);

  const hasRelevantAlerts = relevantAlerts.length > 0;
  const hasOtherAlerts = alerts.length > relevantAlerts.length;

  /** Retourne les alertes affectant une ligne de segment donné. */
  const getAlertsForSegment = useCallback(
    (segment: (typeof segments)[number]) => {
      if (segment.type !== "transit") return [];
      return alerts.filter((alert) =>
        alertMatchesLine(
          alert,
          segment.lineName || segment.mode || "",
          segment.mode,
        ),
      );
    },
    [alerts],
  );

  // ─── Polyline aplatie pour le moteur de navigation ─────────────────────
  // Utilisée par useNavigation pour calculer la progression, le hors-trajet
  // et le bearing vers le prochain manœuvre. Reste une simple concaténation
  // des géométries disponibles.
  const tripPolyline = useMemo(() => {
    if (!trip || segments.length === 0) return [];

    const points: [number, number][] = [];
    for (const seg of segments) {
      if (seg.geojson && seg.geojson.length >= 2) {
        for (const c of seg.geojson) {
          const lat = c[1];
          const lon = c[0];
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            points.push([lat, lon]);
          }
        }
      }
    }

    // Si aucune géométrie n'est disponible, repli sur une ligne droite.
    if (points.length === 0 && originPos && destPos) {
      points.push([originPos.lat, originPos.lon], [destPos.lat, destPos.lon]);
    }

    return points;
  }, [trip, segments, originPos, destPos]);

  // ─── Polylines stylisées par segment pour l'affichage carte ──────────
  //  - Transit : trait plein, couleur de la ligne (M1, RER A, bus…).
  //  - Marche / correspondances : trait gris pointillé.
  //  - GTFS : lazy-load /shape/:id quand Navitia ne fournit pas de geojson.
  const [shapePolylines, setShapePolylines] = useState<
    Array<{ points: [number, number][]; color: string }>
  >([]);

  // Lazy-load des shapes GTFS (uniquement pour les segments transit sans geojson).
  useEffect(() => {
    if (!trip) return;
    const transitSegments = segments.filter((s) => s.type === "transit");
    if (transitSegments.length === 0) return;

    const controller = new AbortController();
    const loadShapes = async () => {
      const shapes: Array<{ points: [number, number][]; color: string }> = [];
      for (const seg of transitSegments) {
        if (seg.geojson && seg.geojson.length >= 2) {
          const points = seg.geojson
            .map((c) => [c[1], c[0]] as [number, number])
            .filter(
              ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon),
            );
          if (points.length >= 2) {
            shapes.push({
              points,
              color: seg.lineColor || "var(--color-favorite-red)",
            });
          }
          continue;
        }
        if (!seg.shapeId) continue;
        try {
          const data = await apiService.getShape(
            seg.shapeId,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          shapes.push({
            points: data.points.map((p) => [p.lat, p.lon]),
            color: seg.lineColor || "var(--color-favorite-red)",
          });
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") return;
          // Ignore shape load errors — fallback to straight line
        }
      }
      if (!controller.signal.aborted) setShapePolylines(shapes);
    };
    loadShapes();
    return () => controller.abort();
  }, [trip, segments]);

  // Construction des polylines affichées : geojson > shape GTFS > ligne droite.
  const mapPolylines = useMemo<MapPolyline[]>(() => {
    const origin = originPos ?? { lat: 48.8566, lon: 2.3522 };
    const dest = destPos ?? { lat: 48.8566, lon: 2.3522 };
    const straightSegments = journeyToSegments(
      { segments },
      origin.lat,
      origin.lon,
      dest.lat,
      dest.lon,
    );

    const polylines: MapPolyline[] = [];
    let transitIdx = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const mode = (seg.mode || seg.type || "marche").toLowerCase();
      const isWalking = seg.type === "walking" || mode === "marche";
      const color =
        seg.lineColor || MAP_MODE_COLORS[mode] || "var(--color-primary)";
      const dashArray = isWalking ? "6, 8" : undefined;
      const weight = seg.type === "transit" ? 5 : 4;

      let points: [number, number][] = [];

      if (seg.geojson && seg.geojson.length >= 2) {
        points = seg.geojson
          .map((c) => [c[1], c[0]] as [number, number])
          .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
      } else if (seg.type === "transit") {
        const shape = shapePolylines[transitIdx];
        if (shape?.points.length >= 2) {
          points = shape.points;
        }
        transitIdx++;
      }

      // Repli ligne droite (connectique corrigée via journeyToSegments).
      if (points.length < 2) {
        const straight = straightSegments[i];
        if (straight?.points.length >= 2) {
          points = straight.points;
        }
      }

      if (points.length >= 2) {
        polylines.push({ points, color, weight, dashArray, opacity: 0.9 });
      }
    }

    return polylines;
  }, [segments, shapePolylines, originPos, destPos]);

  // ─── Navigation GPS hook ─────────────────────────────────────────────
  const {
    isNavigating,
    isPaused,
    activeSegment,
    elapsedSeconds,
    arrived,
    offRoute,
    userPosition,
    currentSpeed,
    remainingDistance,
    remainingTime,
    instruction,
    nextManeuverPoint,
    nextBearing,
    heading,
    startNavigation,
    pauseNavigation,
    resumeNavigation,
    stopNavigation,
    accuracy,
  } = useNavigation(segments, tripPolyline, originPos, destPos, voiceEnabled);

  const { requestPermission: requestDeviceHeading } = useDeviceHeading();
  const { locate: locateUser } = useGeolocation();

  const startNavigationWithPermissions = useCallback(() => {
    // iOS 13+ exige une permission explicite pour l'orientation de l'appareil.
    // On la demande au clic sur "Démarrer la navigation".
    void requestDeviceHeading();
    startNavigation();
  }, [requestDeviceHeading, startNavigation]);

  // Affiche l'écran de succès automatiquement à l'arrivée (une seule fois par trajet).
  const autoSuccessShownRef = useRef(false);
  useEffect(() => {
    if (arrived && isNavigating && !autoSuccessShownRef.current) {
      autoSuccessShownRef.current = true;
      setShowSuccess(true);
    }
  }, [arrived, isNavigating]);

  // Build map markers from real coordinates
  const mapMarkers = useMemo(() => {
    const markers: Array<{
      position: [number, number];
      label: string;
      color: string;
    }> = [];
    if (originPos) {
      markers.push({
        position: [originPos.lat, originPos.lon],
        label: departure,
        color: "#2E7D9B",
      });
    }
    if (destPos) {
      markers.push({
        position: [destPos.lat, destPos.lon],
        label: arrival,
        color: "#E53935",
      });
    }
    if (markers.length === 0) {
      markers.push(
        { position: [48.8606, 2.3456], label: "Châtelet", color: "#2E7D9B" },
        { position: [48.8925, 2.2375], label: "La Défense", color: "#E53935" },
      );
    }
    return markers;
  }, [originPos, destPos, departure, arrival]);

  // Map center: follow user during navigation, else origin or default Paris
  const mapCenter: [number, number] =
    isNavigating && userPosition
      ? [userPosition.lat, userPosition.lon]
      : originPos
        ? [originPos.lat, originPos.lon]
        : [48.8766, 2.2946];

  // Format elapsed time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Format distance
  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Progress percentage
  const totalDurationSeconds = segments.reduce(
    (acc, s) => acc + s.durationMinutes * 60,
    0,
  );
  const progressPercent =
    totalDurationSeconds > 0
      ? Math.min((elapsedSeconds / totalDurationSeconds) * 100, 100)
      : 0;

  // ─── Recalcul d'itinéraire (reroute) sur hors-trajet persistant ──────
  const [isRerouting, setIsRerouting] = useState(false);
  const rerouteAbortRef = useRef<AbortController | null>(null);
  const lastRerouteOriginRef = useRef<{ lat: number; lon: number } | null>(
    null,
  );

  const reroute = useCallback(
    async (fromPos: { lat: number; lon: number }) => {
      if (!destPos) return;
      // Annule la requête de reroute précédente.
      rerouteAbortRef.current?.abort();
      const controller = new AbortController();
      rerouteAbortRef.current = controller;

      setIsRerouting(true);
      Immersion.recalculating();
      try {
        const results = await apiService.searchJourney(
          {
            originLat: fromPos.lat,
            originLon: fromPos.lon,
            destLat: destPos.lat,
            destLon: destPos.lon,
            modes: tripModes,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const newTrip = results[0];
        if (!newTrip) {
          // Aucun itinéraire trouvé depuis cette position → on garde l'ancien.
          return;
        }
        setTrip(newTrip);
        setOriginPos(fromPos);
        lastRerouteOriginRef.current = fromPos;
        // Resync sessionStorage + URL (URL ne contient que les coords, pas le trip).
        try {
          const id = window.location.pathname.split("/").pop();
          if (id) {
            sessionStorage.setItem(`uf:trip:${id}`, JSON.stringify(newTrip));
          }
          const query = new URLSearchParams();
          query.set("originLat", String(fromPos.lat));
          query.set("originLon", String(fromPos.lon));
          query.set("destLat", String(destPos.lat));
          query.set("destLon", String(destPos.lon));
          router.replace(`${window.location.pathname}?${query.toString()}`);
        } catch {
          // best-effort
        }
        // Annonce vocale de la 1ʳᵉ instruction du nouvel itinéraire.
        const firstSeg = newTrip.segments[0];
        if (firstSeg) {
          Immersion.segmentChange(
            firstSeg.type === "walking"
              ? firstSeg.instruction
              : `Montez dans le ${firstSeg.mode || "transit"} direction ${firstSeg.direction || firstSeg.toStop || ""}`,
          );
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // Repli silencieux : on garde l'itinéraire courant.
        console.warn("Reroute failed:", err);
      } finally {
        if (!controller.signal.aborted) setIsRerouting(false);
      }
    },
    [destPos, router, tripModes],
  );

  // ─── Déclenchement auto : hors-trajet persistant > 8 s (+ 30 m de déplacement) ──
  useEffect(() => {
    if (!isNavigating || !offRoute || !userPosition) return;
    // Si l'utilisateur n'a pas bougé > 30 m depuis le dernier reroute, on évite le
    // spam (il est peut-être juste arrêté hors trajet).
    const last = lastRerouteOriginRef.current;
    if (last) {
      const moved = haversinePage(
        userPosition.lat,
        userPosition.lon,
        last.lat,
        last.lon,
      );
      if (moved < 30) return;
    }
    const timer = setTimeout(() => {
      if (userPosition) reroute(userPosition);
    }, 8000);
    return () => clearTimeout(timer);
  }, [isNavigating, offRoute, userPosition, reroute]);

  // ─── Cap de la carte (leaflet-rotate) + zoom segment actif ───────────
  // Pendant la navigation, on oriente la carte selon le cap de l'appareil
  // (GPS + boussole via DeviceOrientationEvent). Le cap doit être suivi même
  // à l'arrêt pour que la carte pivote quand l'utilisateur tourne le téléphone.
  const mapBearing = useMemo(() => {
    if (!isNavigating) return 0;
    if (heading != null && heading >= 0) return heading; // cap device (GPS ou boussole)
    if (nextBearing != null) return nextBearing; // repli : vers le prochain manœuvre
    return 0; // nord en haut
  }, [isNavigating, heading, nextBearing]);

  const activeFitBounds = useMemo<Array<[number, number]> | undefined>(() => {
    if (!isNavigating || !userPosition || !nextManeuverPoint) return undefined;
    return [
      [userPosition.lat, userPosition.lon],
      [nextManeuverPoint.lat, nextManeuverPoint.lon],
    ];
  }, [isNavigating, userPosition, nextManeuverPoint]);

  const fitBoundsKey = isNavigating ? `seg-${activeSegment}` : undefined;

  return (
    <AppShell
      title={isNavigating ? "Navigation" : "Détail itinéraire"}
      showBack={!isNavigating}
      hideNav={isNavigating}
      fullBleed={isNavigating}
      rightAction={
        !isNavigating ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFavorite}
              disabled={favoriteLoading}
              className={`transition-colors ${
                isFavoriteState
                  ? "text-[var(--color-favorite-red)]"
                  : "text-white/80 hover:text-white"
              } ${favoriteLoading ? "opacity-50" : ""}`}
              aria-label={
                isFavoriteState ? "Retirer des favoris" : "Ajouter aux favoris"
              }
              aria-pressed={isFavoriteState}
            >
              <UrbanFlowIcon
                type="navigation"
                name="favorites"
                size={20}
                className={isFavoriteState ? "fill-current" : "fill-none"}
              />
            </button>
            <button
              type="button"
              onClick={async () => {
                const shareUrl = typeof window !== "undefined" ? window.location.href : "";
                const shareData = {
                  title: "Mon itinéraire UrbanFlow",
                  text: `Trajet ${trip?.segments?.[0]?.fromStop || "départ"} → ${trip?.segments?.[trip.segments.length - 1]?.toStop || "arrivée"} — ${trip?.durationMinutes} min`,
                  url: shareUrl,
                };
                try {
                  if (navigator.share) {
                    await navigator.share(shareData);
                  } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(shareUrl);
                     
                    alert("Lien copié dans le presse-papiers");
                  }
                } catch {
                  // ignore
                }
              }}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Partager"
            >
              <UrbanFlowIcon type="action" name="share" size={20} />
            </button>
          </div>
        ) : null
      }
    >
      {/* Chargement si le trajet est en cours de recalcul (refresh / nouvel onglet) */}
      {tripLoading && !trip && (
        <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-secondary)]">
          <Loader2
            className="animate-spin text-[var(--color-primary)] mb-3"
            size={32}
          />
          <p className="text-sm">Recalcul de l&apos;itinéraire…</p>
        </div>
      )}

      {/* Bannière turn-by-turn (overlay fixed sous le header, nav only) */}
      {isNavigating && instruction && (
        <TurnByTurnBanner
          instruction={instruction}
          accentColor={segments[activeSegment]?.lineColor}
        />
      )}

      {/* Mode normal : résumé, timeline, carte, CTA */}
      {!isNavigating && (
        <>
          {/* Summary Card */}
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={reducedMotion ? false : { opacity: 1, y: 0 }}
            transition={
              reducedMotion ? undefined : { duration: 0.4, ease: "easeOut" }
            }
            className="bg-[var(--color-primary)] rounded-[var(--card-radius)] p-4 text-white mb-4 relative overflow-hidden"
          >
            {/* Halo animé d'arrière-plan */}
            {!reducedMotion && (
              <motion.div
                aria-hidden
                className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            )}
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-white/80">Trajet</p>
                <p className="text-lg font-semibold">
                  {departure} → {arrival}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{duration}</p>
                <CO2Badge grams={co2} size="md" />
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/70">
              <span className="flex items-center gap-1">
                <UrbanFlowIcon type="status" name="clock" size={14} />
                {duration}
              </span>
              <span>
                {transfers === 0
                  ? "Direct"
                  : `${transfers} correspondance${transfers > 1 ? "s" : ""}`}
              </span>
            </div>
          </motion.div>

          {/* CO2 Comparison */}
          <CO2Comparison co2={co2} distanceKm={trip?.distanceKm} />

          {/* Bandeau récapitulatif des alertes */}
          <div className="mb-4">
            {hasRelevantAlerts ? (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                animate={reducedMotion ? false : { opacity: 1, y: 0 }}
                className="rounded-[var(--card-radius)] border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3"
              >
                <div className="flex items-start gap-2">
                  <UrbanFlowIcon
                    type="status"
                    name="alert"
                    className="shrink-0 text-amber-600"
                    size={18}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      {relevantAlerts.length} perturbation
                      {relevantAlerts.length > 1 ? "s" : ""} sur votre trajet
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                      Cliquez sur les segments concernés dans la timeline pour
                      voir les détails.
                    </p>
                    {hasOtherAlerts && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                        D&apos;autres alertes affectent le réseau — consultez
                        l&apos;onglet Alertes.
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : trip ? (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                animate={reducedMotion ? false : { opacity: 1, y: 0 }}
                className="rounded-[var(--card-radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex items-center gap-2"
              >
                <UrbanFlowIcon
                  type="status"
                  name="check"
                  className="shrink-0 text-[var(--color-eco-green)]"
                  size={18}
                />
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Aucune perturbation observée sur votre trajet.
                </p>
              </motion.div>
            ) : null}
          </div>

          {/* Timeline */}
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
            Détail du trajet
          </h2>
          <div className="space-y-3">
            {segments.map((segment, i) => {
              const isActive = isNavigating && i === activeSegment;
              const isDone = isNavigating && i < activeSegment;
              const modeMeta = getModeInfo(segment.mode, segment.type);
              const lineColor = segment.lineColor;
              const segmentAlerts = getAlertsForSegment(segment);
              const segmentHasAlerts = segmentAlerts.length > 0;
              const displayedAlerts = segmentAlerts.slice(0, 3);
              const hiddenAlertCount = Math.max(0, segmentAlerts.length - 3);
              const segmentExpanded = expandedAlertSegments.has(i);

              return (
                <motion.div
                  key={i}
                  initial={reducedMotion ? false : { opacity: 0, x: -12 }}
                  animate={reducedMotion ? false : { opacity: 1, x: 0 }}
                  transition={
                    reducedMotion
                      ? undefined
                      : { type: "spring" as const, stiffness: 300, damping: 28 }
                  }
                  onClick={() => {
                    if (!segmentHasAlerts) return;
                    setExpandedAlertSegments((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                  }}
                  className={`relative flex gap-3 rounded-xl p-3 border ${
                    isActive
                      ? "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30 shadow-sm"
                      : isDone
                        ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/50"
                        : "bg-surface border-[var(--color-border)]"
                  } ${segmentHasAlerts ? "cursor-pointer" : ""}`}
                >
                  {/* Timeline node : icône + couleur de la ligne */}
                  <div className="flex flex-col items-center pt-0.5">
                    <div
                      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                        isDone ? "bg-emerald-500 text-white" : "text-white"
                      } ${isActive ? "scale-110" : ""}`}
                      style={
                        !isDone
                          ? { backgroundColor: lineColor || "#2E7D9B" }
                          : {}
                      }
                    >
                      {isDone ? (
                        <UrbanFlowIcon type="status" name="check" size={18} />
                      ) : (
                        <ModeIcon mode={modeMeta.resolvedMode} size={18} />
                      )}
                    </div>
                    {i < segments.length - 1 && (
                      <div
                        className={`w-0.5 flex-1 min-h-[12px] mt-1 ${isDone ? "bg-emerald-300" : "bg-[var(--color-border)]"}`}
                      />
                    )}
                  </div>

                  {/* Segment content */}
                  <div
                    className={`flex-1 min-w-0 ${isDone ? "opacity-60" : ""}`}
                  >
                    {/* Ligne 1 : mode badge + trajet */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {segment.type === "transit" && segment.lineName ? (
                        <span className="inline-flex items-center gap-1">
                          <ModeBadge
                            mode={segment.mode}
                            type={segment.type}
                            lineName={segment.lineName}
                            lineColor={lineColor}
                            size="md"
                          />
                          <AddFavoriteLineButton
                            lineId={segment.lineId}
                            lineName={segment.lineName}
                            mode={segment.mode}
                            lineColor={segment.lineColor}
                            size="md"
                          />
                        </span>
                      ) : (
                        <ModeBadge
                          mode={segment.mode}
                          type={segment.type}
                          size="md"
                          showLabel
                        />
                      )}
                      <span
                        className={`text-sm font-medium truncate ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]"}`}
                      >
                        {segment.type === "transit"
                          ? `${segment.fromStop} → ${segment.toStop}`
                          : segment.instruction}
                      </span>
                      {isActive && (
                        <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-primary)] text-white shrink-0">
                          <UrbanFlowIcon type="status" name="info" size={10} /> En cours
                        </span>
                      )}
                      {segmentHasAlerts && !isActive && (
                        <span
                          className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                            segmentAlerts.some((a) => a.severity === "severe")
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200"
                              : segmentAlerts.some(
                                    (a) => a.severity === "warning",
                                  )
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                                : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                          }`}
                        >
                          <UrbanFlowIcon type="status" name="alert" size={10} />
                          {hiddenAlertCount > 0
                            ? `${displayedAlerts.length}+`
                            : `${segmentAlerts.length}`}{" "}
                          alerte{segmentAlerts.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Ligne 2 : stats rapides (durée, arrêts, horaires) */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-[var(--color-text-tertiary)]">
                      <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text-secondary)]">
                        <UrbanFlowIcon type="status" name="clock" size={11} />
                        {segment.durationMinutes} min
                      </span>
                      {segment.type !== "walking" && segment.numStops && (
                        <span className="inline-flex items-center gap-1">
                          <UrbanFlowIcon type="status" name="info" size={11} />
                          {segment.numStops} arrêt
                          {segment.numStops > 1 ? "s" : ""}
                        </span>
                      )}
                      {segment.departureTime && segment.arrivalTime && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <UrbanFlowIcon type="status" name="clock" size={11} />
                          {segment.departureTime.slice(0, 5)} →{" "}
                          {segment.arrivalTime.slice(0, 5)}
                        </span>
                      )}
                      {segment.distanceKm && segment.distanceKm > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <UrbanFlowIcon type="action" name="arrow-right" size={11} />
                          {(segment.distanceKm * 1000).toFixed(0)}m
                        </span>
                      )}
                    </div>

                    {/* Détails enrichis : direction, terminus, quai, attente */}
                    {segment.type === "transit" &&
                      (segment.direction ||
                        segment.platform ||
                        segment.waitTimeMinutes !== undefined ||
                        segment.headsign) && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          {segment.direction && (
                            <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                              <UrbanFlowIcon
                                type="action"
                                name="locate"
                                size={11}
                                className="text-[var(--color-primary)] shrink-0"
                              />
                              <span>Direction :</span>
                              <span className="font-semibold text-[var(--color-text-primary)]">
                                {segment.direction}
                              </span>
                            </div>
                          )}
                          {segment.headsign &&
                            segment.headsign !== segment.direction && (
                              <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                                <UrbanFlowIcon
                                  type="action"
                                  name="locate"
                                  size={11}
                                  className="text-[var(--color-mobility-orange)] shrink-0"
                                />
                                <span>Terminus :</span>
                                <span className="font-semibold text-[var(--color-text-primary)]">
                                  {segment.headsign}
                                </span>
                              </div>
                            )}
                          {segment.platform && (
                            <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[var(--color-mobility-orange)]/15 text-[var(--color-mobility-orange)] text-[9px] font-bold shrink-0">
                                P
                              </span>
                              <span>{segment.platform}</span>
                            </div>
                          )}
                          {segment.waitTimeMinutes !== undefined && (
                            <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                              <UrbanFlowIcon
                                type="status"
                                name="clock"
                                size={11}
                                className="text-[var(--color-eco-green)] shrink-0"
                              />
                              <span>Attente :</span>
                              <span className="font-semibold text-[var(--color-text-primary)]">
                                {segment.waitTimeMinutes} min
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Alertes contextualisées pour ce segment */}
                    <AnimatePresence>
                      {segmentExpanded && segmentHasAlerts && (
                        <motion.div
                          initial={
                            reducedMotion ? false : { opacity: 0, height: 0 }
                          }
                          animate={
                            reducedMotion
                              ? false
                              : { opacity: 1, height: "auto" }
                          }
                          exit={
                            reducedMotion
                              ? undefined
                              : { opacity: 0, height: 0 }
                          }
                          className="mt-2 space-y-2 overflow-hidden"
                        >
                          {displayedAlerts.map((alert, idx) => (
                            <div
                              key={idx}
                              className={`rounded-lg border p-2.5 text-xs ${
                                alert.severity === "severe"
                                  ? "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800"
                                  : alert.severity === "warning"
                                    ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800"
                                    : "border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-800"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <UrbanFlowIcon
                                  type="status"
                                  name="alert"
                                  size={14}
                                  className={`shrink-0 mt-0.5 ${
                                    alert.severity === "severe"
                                      ? "text-red-600 dark:text-red-300"
                                      : alert.severity === "warning"
                                        ? "text-amber-600 dark:text-amber-300"
                                        : "text-sky-600 dark:text-sky-300"
                                  }`}
                                />
                                <div className="flex-1">
                                  <p
                                    className={`font-semibold ${
                                      alert.severity === "severe"
                                        ? "text-red-800 dark:text-red-200"
                                        : alert.severity === "warning"
                                          ? "text-amber-800 dark:text-amber-200"
                                          : "text-sky-800 dark:text-sky-200"
                                    }`}
                                  >
                                    {alert.headerText ||
                                      alert.effect ||
                                      "Perturbation"}
                                    {alert.severity && (
                                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-bold bg-white/60 dark:bg-black/20">
                                        {alert.severity}
                                      </span>
                                    )}
                                  </p>
                                  {alert.descriptionText &&
                                    alert.descriptionText !==
                                      alert.headerText && (
                                      <p className="mt-1 text-[var(--color-text-secondary)]">
                                        {alert.descriptionText}
                                      </p>
                                    )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {hiddenAlertCount > 0 && (
                            <div className="text-[11px] text-[var(--color-text-tertiary)] text-center py-1">
                              + {hiddenAlertCount} alerte
                              {hiddenAlertCount > 1 ? "s" : ""} supplémentaire
                              {hiddenAlertCount > 1 ? "s" : ""} — voir l’onglet
                              Alertes
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Map */}
          <div className="rounded-[var(--card-radius)] h-48 mb-4 border border-[var(--color-border)] overflow-hidden">
            <DynamicMap
              center={mapCenter}
              zoom={isNavigating ? 16 : 13}
              markers={mapMarkers}
              polylines={mapPolylines}
              userPosition={
                userPosition
                  ? {
                      lat: userPosition.lat,
                      lon: userPosition.lon,
                      accuracy: accuracy ?? undefined,
                      heading,
                    }
                  : undefined
              }
              onLocateUser={locateUser}
              isWatching={isNavigating}
              onToggleWatch={
                isNavigating ? stopNavigation : startNavigationWithPermissions
              }
              followUser={isNavigating}
              bearing={mapBearing}
              fitBounds={activeFitBounds}
              fitBoundsKey={fitBoundsKey}
            />
          </div>

          {/* CTA — Navigation mode */}
          <AnimatePresence mode="wait">
            {!isNavigating ? (
              <motion.button
                key="cta-start"
                type="button"
                onClick={startNavigationWithPermissions}
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                transition={
                  reducedMotion ? { duration: 0 } : { duration: 0.25 }
                }
                className="w-full h-[52px] rounded-[var(--cta-radius)] bg-[var(--color-primary)] text-white font-semibold text-base hover:bg-[var(--color-primary-dark)] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[var(--color-primary)]/20"
              >
                {reducedMotion ? (
                  <span className="inline-flex">
                    <Play size={18} />
                  </span>
                ) : (
                  <motion.span
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="inline-flex"
                  >
                    <Play size={18} />
                  </motion.span>
                )}
                Démarrer le trajet
              </motion.button>
            ) : (
              <motion.div
                key="nav-active"
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
                className="space-y-3"
              >
                {/* Progress bar */}
                <div className="bg-[var(--color-surface)] rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-primary)] transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Timer + controls */}
                <div className="flex items-center justify-between bg-[var(--color-primary)] rounded-[var(--card-radius)] p-4 text-white">
                  <div>
                    <p className="text-xs text-white/70">Temps écoulé</p>
                    <p className="text-2xl font-bold font-mono">
                      {formatTime(elapsedSeconds)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={isPaused ? resumeNavigation : pauseNavigation}
                      className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                      aria-label={isPaused ? "Reprendre" : "Pause"}
                    >
                      {isPaused ? <Play size={20} /> : <Pause size={20} />}
                    </button>
                    <button
                      onClick={stopNavigation}
                      className="w-12 h-12 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors"
                      aria-label="Terminer le trajet"
                    >
                      <Square size={20} />
                    </button>
                  </div>
                </div>

                {/* Active segment info */}
                {segments[activeSegment] && (
                  <div className="bg-surface rounded-[var(--card-radius)] p-3 border border-[var(--color-border)]">
                    <p className="text-xs text-[var(--color-text-tertiary)] mb-1">
                      Étape en cours
                    </p>
                    <p className="text-sm font-medium text-[var(--color-primary)]">
                      {segments[activeSegment].instruction}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                      {segments[activeSegment].durationMinutes} min · Étape{" "}
                      {activeSegment + 1}/{segments.length}
                    </p>
                  </div>
                )}

                {/* GPS info panel */}
                {userPosition && (
                  <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-text-tertiary)]">
                        Distance restante
                      </span>
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {formatDistance(remainingDistance)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[var(--color-text-tertiary)]">
                        ETA
                      </span>
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {remainingTime > 0
                          ? `~${Math.ceil(remainingTime)} min`
                          : "—"}
                      </span>
                    </div>
                    {currentSpeed > 0 && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[var(--color-text-tertiary)]">
                          Vitesse
                        </span>
                        <span className="font-semibold text-[var(--color-text-primary)]">
                          {currentSpeed.toFixed(1)} km/h
                        </span>
                      </div>
                    )}
                    {accuracy && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[var(--color-text-tertiary)]">
                          Précision GPS
                        </span>
                        <span className="text-[var(--color-text-tertiary)]">
                          ±{Math.round(accuracy)}m
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Off-route warning */}
                {offRoute && !arrived && (
                  <div className="bg-amber-50 border border-amber-200 rounded-[var(--card-radius)] p-3 flex items-center gap-2">
                    <UrbanFlowIcon
                      type="status"
                      name="alert"
                      size={18}
                      className="text-amber-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800">
                        {isRerouting ? "Recalcul en cours…" : "Hors trajet"}
                      </p>
                      <p className="text-xs text-amber-600">
                        {isRerouting
                          ? "Nouvel itinéraire depuis votre position"
                          : "Vous vous êtes écarté de l&apos;itinéraire"}
                      </p>
                    </div>
                    {!isRerouting && userPosition && (
                      <button
                        type="button"
                        onClick={() => reroute(userPosition)}
                        disabled={!destPos}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                        aria-label="Recalculer l'itinéraire"
                      >
                        <RotateCcw size={14} />
                        Recalculer
                      </button>
                    )}
                  </div>
                )}

                {/* Arrived notification */}
                {arrived && (
                  <div className="bg-[var(--color-eco-green)]/10 border border-[var(--color-eco-green)]/30 rounded-[var(--card-radius)] p-3 flex items-center gap-2">
                    <UrbanFlowIcon
                      type="status"
                      name="check"
                      size={18}
                      className="text-[var(--color-eco-green)] shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-eco-green)]">
                        Vous êtes arrivé !
                      </p>
                      <p className="text-xs text-[var(--color-eco-green)]/70">
                        Destination atteinte
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Mode navigation : carte plein écran + overlays */}
      {isNavigating && (
        <div className="absolute inset-0 flex flex-col z-0">
          <div className="relative flex-1 min-h-0 isolate">
            <DynamicMap
              center={mapCenter}
              zoom={16}
              markers={mapMarkers}
              polylines={mapPolylines}
              userPosition={
                userPosition
                  ? {
                      lat: userPosition.lat,
                      lon: userPosition.lon,
                      accuracy: accuracy ?? undefined,
                      heading,
                    }
                  : undefined
              }
              onLocateUser={() => {}}
              isWatching={isNavigating}
              onToggleWatch={() => {}}
              followUser={isNavigating}
              bearing={mapBearing}
              fitBounds={activeFitBounds}
              fitBoundsKey={fitBoundsKey}
            />

            {/* Boutons flottants */}
            <div className="absolute top-3 right-3 z-[500] flex flex-col gap-2">
              <button
                onClick={() => setVoiceEnabled((v) => !v)}
                className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-colors ${
                  voiceEnabled
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-white text-[var(--color-text-secondary)]"
                }`}
                aria-label={
                  voiceEnabled ? "Désactiver la voix" : "Activer la voix"
                }
              >
                {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>
            </div>

            {/* Contrôles de navigation en bas */}
            <div className="absolute bottom-6 left-4 right-4 z-[500] space-y-3">
              {/* Progress bar */}
              <div className="bg-black/50 backdrop-blur-sm rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-[var(--color-primary)] transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between bg-[var(--color-primary)] rounded-[var(--card-radius)] p-4 text-white shadow-lg">
                <div>
                  <p className="text-xs text-white/70">Temps écoulé</p>
                  <p className="text-2xl font-bold font-mono">
                    {formatTime(elapsedSeconds)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={isPaused ? resumeNavigation : pauseNavigation}
                    className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                    aria-label={isPaused ? "Reprendre" : "Pause"}
                  >
                    {isPaused ? <Play size={20} /> : <Pause size={20} />}
                  </button>
                  <button
                    onClick={() => setShowSuccess(true)}
                    className="w-12 h-12 rounded-full bg-white text-[var(--color-primary)] hover:bg-white/90 flex items-center justify-center transition-colors"
                    aria-label="Terminer le trajet"
                  >
                    <UrbanFlowIcon type="status" name="check" size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Écran de succès / récap à l'arrivée */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={
                reducedMotion ? false : { scale: 0.9, opacity: 0, y: 20 }
              }
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={
                reducedMotion ? undefined : { scale: 0.95, opacity: 0, y: 20 }
              }
              transition={
                reducedMotion
                  ? undefined
                  : { type: "spring", stiffness: 300, damping: 25 }
              }
              className="w-full max-w-sm bg-[var(--color-surface)] rounded-[var(--card-radius)] p-6 shadow-2xl text-center"
            >
              <div className="mb-4 flex justify-center">
                {!reducedMotion ? (
                  <motion.div
                    animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="w-20 h-20 rounded-full bg-[var(--color-eco-green)]/15 flex items-center justify-center"
                  >
                    <PartyPopper
                      size={40}
                      className="text-[var(--color-eco-green)]"
                    />
                  </motion.div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[var(--color-eco-green)]/15 flex items-center justify-center">
                    <PartyPopper
                      size={40}
                      className="text-[var(--color-eco-green)]"
                    />
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
                Vous êtes arrivé !
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] mb-5">
                {arrival}
              </p>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl bg-[var(--color-primary)]/5 p-3">
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Temps de trajet
                  </p>
                  <p className="text-lg font-bold text-[var(--color-primary)]">
                    {formatTime(elapsedSeconds)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--color-primary)]/5 p-3">
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Distance
                  </p>
                  <p className="text-lg font-bold text-[var(--color-primary)]">
                    {(trip?.distanceKm ?? 0) > 0
                      ? `${(trip?.distanceKm ?? 0).toFixed(1)} km`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--color-eco-green)]/10 p-3 col-span-2">
                  <p className="text-xs text-[var(--color-eco-green)]/80">
                    CO₂ économisé vs voiture
                  </p>
                  <p className="text-2xl font-bold text-[var(--color-eco-green)]">
                    {(() => {
                      const km = trip?.distanceKm ?? 0;
                      const saved = Math.max(
                        0,
                        Math.round(km * CAR_EMISSION_G_PER_KM - co2),
                      );
                      return saved > 0 ? `${saved} g` : "Bravo !";
                    })()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  stopNavigation();
                  setShowSuccess(false);
                  // Sauvegarde le trajet dans l'historique utilisateur (si connecté).
                  addToHistory({
                    from: departure,
                    to: arrival,
                    mode: historyMode,
                    modeColor: historyModeColor,
                    duration,
                    co2,
                    origin: originPos ?? undefined,
                    destination: destPos ?? undefined,
                  }).catch(() => {
                    // Silencieux : l'historique n'est pas bloquant.
                  });
                }}
                className="w-full h-[52px] rounded-[var(--cta-radius)] bg-[var(--color-primary)] text-white font-semibold text-base hover:bg-[var(--color-primary-dark)] transition-colors flex items-center justify-center gap-2"
              >
                <Trophy size={20} />
                Terminer le trajet
              </button>
              <button
                onClick={() => setShowSuccess(false)}
                className="w-full mt-2 h-10 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Retour à la carte
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
