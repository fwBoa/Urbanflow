"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, MapPin, Footprints, Bike, Train, TramFront, Bus, Ship, Car, ArrowRight, Navigation, Leaf, Navigation2, Pause, Square, Play, AlertTriangle, AlertOctagon, CheckCircle2, ChevronUp, ChevronDown, Wifi, WifiOff, Search, X, Timer, ArrowDown, CircleDot } from "lucide-react";
import AppShell from "@/components/AppShell";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
import JourneyLine from "@/components/JourneyLine";
import ModeBadge from "@/components/ModeBadge";
import { useRoute } from "@/hooks/useTransport";
import { useNavigation } from "@/hooks/useNavigation";
import { apiService } from "@/services/api";
import type { JourneyResult } from "@/services/api";

const modeIcons: Record<string, React.ReactNode> = {
  metro: <Train size={18} />,
  bus: <Bus size={18} />,
  rer: <Train size={18} />,
  tram: <Train size={18} />,
  marche: <Footprints size={18} />,
  velib: <Bike size={18} />,
};

function getModeLabel(mode?: string): string {
  if (!mode) return "Transit";
  const m = mode.toLowerCase();
  if (m.includes("métro") || m.includes("metro")) return "Métro";
  if (m.includes("rer")) return "RER";
  if (m.includes("bus")) return "Bus";
  if (m.includes("tram")) return "Tram";
  if (m.includes("transilien") || m.includes("train")) return "Train";
  if (m.includes("marche") || m.includes("walk")) return "Marche";
  if (m.includes("vélib") || m.includes("velib")) return "Vélib'";
  return mode;
}

function getSegmentIcon(segment: JourneyResult["segments"][0], isDone: boolean) {
  if (isDone) return <CheckCircle2 size={14} />;
  if (segment.type === "walking") return <Footprints size={14} />;
  if (segment.type === "velib") return <Bike size={14} />;
  const mode = segment.mode?.toLowerCase() || "";
  if (mode.includes("tram")) return <TramFront size={14} />;
  if (mode.includes("bus")) return <Bus size={14} />;
  if (mode.includes("rer")) return <Train size={14} />;
  if (mode.includes("métro") || mode.includes("metro")) return <Train size={14} />;
  return <Bus size={14} />;
}

// ─── Mode metadata (label FR, icône, couleur de fond, couleur d'accent) ─────
function getModeInfo(mode?: string, type?: string): {
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  bgColor: string;
  ringColor: string;
} {
  const m = (mode || "").toLowerCase();
  const t = type || "";
  if (t === "walking") return { label: "Marche", Icon: Footprints, bgColor: "bg-slate-100 dark:bg-slate-800", ringColor: "ring-slate-300" };
  if (t === "velib" || m.includes("vélib") || m.includes("velib")) return { label: "Vélib'", Icon: Bike, bgColor: "bg-[var(--color-eco-green)]/10", ringColor: "ring-[var(--color-eco-green)]" };
  if (m.includes("tram")) return { label: "Tram", Icon: TramFront, bgColor: "bg-purple-100 dark:bg-purple-900/30", ringColor: "ring-purple-300" };
  if (m.includes("bus")) return { label: "Bus", Icon: Bus, bgColor: "bg-sky-100 dark:bg-sky-900/30", ringColor: "ring-sky-300" };
  if (m.includes("rer")) return { label: "RER", Icon: Train, bgColor: "bg-pink-100 dark:bg-pink-900/30", ringColor: "ring-pink-300" };
  if (m.includes("métro") || m.includes("metro")) return { label: "Métro", Icon: Train, bgColor: "bg-blue-100 dark:bg-blue-900/30", ringColor: "ring-blue-300" };
  if (m.includes("transilien") || m.includes("train")) return { label: "Train", Icon: Train, bgColor: "bg-indigo-100 dark:bg-indigo-900/30", ringColor: "ring-indigo-300" };
  return { label: "Transit", Icon: Bus, bgColor: "bg-slate-100", ringColor: "ring-slate-300" };
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
      durationMinutes: 3,
      distanceKm: 0.2,
      instruction: "Marcher jusqu'à Châtelet (200m)",
    },
    {
      type: "transit" as const,
      mode: "RER A",
      lineName: "RER A",
      lineColor: "#1A5A73",
      from: "Châtelet",
      to: "La Défense",
      durationMinutes: 18,
      numStops: 4,
      instruction: "Prendre RER A de Châtelet à La Défense",
    },
    {
      type: "walking" as const,
      mode: "marche",
      from: "La Défense",
      to: "Destination",
      durationMinutes: 1,
      distanceKm: 0.1,
      instruction: "Marcher jusqu'à destination (100m)",
    },
  ],
};

export default function TripDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse journey data from URL
  let trip: JourneyResult | null = null;
  try {
    const data = searchParams.get("data");
    if (data) {
      trip = JSON.parse(decodeURIComponent(data));
    }
  } catch {
    // Use fallback
  }

  const segments = (trip?.segments || fallbackTrip.segments) as JourneyResult["segments"];
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  // Vrai nom de l'arrêt de départ : toStop du 1er walking, ou fromStop du 1er transit
  const realDeparture = firstSeg?.type === "walking"
    ? (firstSeg.toStop ?? firstSeg.fromStop)
    : firstSeg?.fromStop;
  // Vrai nom de l'arrêt d'arrivée : fromStop du dernier walking, ou toStop du dernier transit
  const realArrival = lastSeg?.type === "walking"
    ? (lastSeg.fromStop ?? lastSeg.toStop)
    : lastSeg?.toStop;
  const departure = realDeparture ?? firstSeg?.instruction?.split(" ").slice(-1)[0] ?? "Départ";
  const arrival = realArrival ?? lastSeg?.instruction?.split(" ").slice(-1)[0] ?? "Arrivée";
  const duration = trip ? `${trip.durationMinutes} min` : fallbackTrip.duration;
  const co2 = trip?.co2Ggrams || fallbackTrip.co2;
  const transfers = trip?.transfers ?? fallbackTrip.transfers;

  // ─── Coordinates from search page ────────────────────────────────────
  const originLat = searchParams.get("originLat");
  const originLon = searchParams.get("originLon");
  const destLat = searchParams.get("destLat");
  const destLon = searchParams.get("destLon");

  const hasCoords = originLat && originLon && destLat && destLon;
  const originPos = hasCoords ? { lat: parseFloat(originLat!), lon: parseFloat(originLon!) } : null;
  const destPos = hasCoords ? { lat: parseFloat(destLat!), lon: parseFloat(destLon!) } : null;

  // ─── Alertes temps réel sur ce trajet ────────────────────────────────
  const alerts = trip?.alerts || [];

  // ─── OSRM Routing for real geometry ─────────────────────────────────
  const { geometry: routeGeometry, fetchRoute } = useRoute();
  const [tripPolyline, setTripPolyline] = useState<[number, number][]>([]);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (originPos && destPos && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchRoute(originPos.lat, originPos.lon, destPos.lat, destPos.lon, 'foot')
        .then((coords) => {
          if (coords.length > 0) {
            setTripPolyline(coords);
          } else {
            setTripPolyline([
              [originPos.lat, originPos.lon],
              [destPos.lat, destPos.lon],
            ]);
          }
        });
    }
  }, [originPos, destPos]);

  // ─── Lazy load shapes (trajectoires réelles) ────────────────────────
  const [shapePolylines, setShapePolylines] = useState<Array<{ points: [number, number][]; color: string }>>([]);

  useEffect(() => {
    if (!trip) return;
    const transitSegments = segments.filter((s) => s.type === 'transit' && s.shapeId);
    if (transitSegments.length === 0) return;

    let cancelled = false;
    const loadShapes = async () => {
      const shapes: Array<{ points: [number, number][]; color: string }> = [];
      for (const seg of transitSegments) {
        if (!seg.shapeId) continue;
        try {
          const data = await apiService.getShape(seg.shapeId);
          if (cancelled) return;
          shapes.push({
            points: data.points.map((p) => [p.lat, p.lon]),
            color: seg.lineColor || "#E53935",
          });
        } catch {
          // Ignore shape load errors — fallback to straight line
        }
      }
      if (!cancelled) setShapePolylines(shapes);
    };
    loadShapes();
    return () => { cancelled = true; };
  }, [trip, segments]);

  // ─── Navigation GPS hook ─────────────────────────────────────────────
  const {
    isNavigating,
    isPaused,
    activeSegment,
    elapsedSeconds,
    progress,
    arrived,
    offRoute,
    userPosition,
    currentSpeed,
    remainingDistance,
    remainingTime,
    instruction,
    startNavigation,
    pauseNavigation,
    resumeNavigation,
    stopNavigation,
    accuracy,
  } = useNavigation(
    segments,
    tripPolyline,
    originPos,
    destPos,
  );

  // Build map markers from real coordinates
  const mapMarkers = useMemo(() => {
    const markers: Array<{ position: [number, number]; label: string; color: string }> = [];
    if (originPos) {
      markers.push({ position: [originPos.lat, originPos.lon], label: departure, color: "#2E7D9B" });
    }
    if (destPos) {
      markers.push({ position: [destPos.lat, destPos.lon], label: arrival, color: "#E53935" });
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
  const mapCenter: [number, number] = isNavigating && userPosition
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
  const totalDurationSeconds = segments.reduce((acc, s) => acc + s.durationMinutes * 60, 0);
  const progressPercent = totalDurationSeconds > 0 ? Math.min((elapsedSeconds / totalDurationSeconds) * 100, 100) : 0;

  return (
    <AppShell
      title="Détail itinéraire"
      showBack
      rightAction={
        <button className="text-white/80 hover:text-white transition-colors" aria-label="Partager">
          <Navigation2 size={20} />
        </button>
      }
    >
      {/* Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-[var(--color-primary)] rounded-[var(--card-radius)] p-4 text-white mb-4 relative overflow-hidden"
      >
        {/* Halo animé d'arrière-plan */}
        <motion.div
          aria-hidden
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
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
            <Clock size={14} />
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
      <div className="bg-[var(--color-eco-green)]/10 rounded-[var(--card-radius)] p-3 mb-4 border border-[var(--color-eco-green)]/20">
        <div className="flex items-center gap-2">
          <Leaf size={16} className="text-[var(--color-eco-green)]" />
          <p className="text-sm text-[var(--color-eco-green)]">
            <span className="font-semibold">
              {co2 > 0 ? `${Math.round((1 - co2 / (co2 * 5.3)) * 100)}%` : "100%"} moins de CO₂
            </span>{" "}
            qu&apos;en voiture
          </p>
        </div>
      </div>

      {/* Alertes temps réel */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          <h2 className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
            <AlertTriangle size={16} />
            Perturbation{alerts.length > 1 ? "s" : ""} en cours
          </h2>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-[var(--card-radius)] p-3 border text-sm ${
                alert.severity === 'severe'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : alert.severity === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <p className="font-medium">{alert.headerText}</p>
              {alert.descriptionText && (
                <p className="text-xs mt-1 opacity-80">{alert.descriptionText}</p>
              )}
              {alert.affectedRoutes?.length > 0 && (
                <p className="text-[11px] mt-1.5 opacity-70">
                  Lignes concernées : {alert.affectedRoutes.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
        Détail du trajet
      </h2>
      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
        }}
      >
        {segments.map((segment, i) => {
          const isActive = isNavigating && i === activeSegment;
          const isDone = isNavigating && i < activeSegment;
          const modeMeta = getModeInfo(segment.mode, segment.type);
          const ModeIcon = modeMeta.Icon;
          const lineColor = segment.lineColor;

          return (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, x: -12 },
                visible: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
              }}
              className={`relative flex gap-3 rounded-xl p-3 border ${
                isActive ? "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30 shadow-sm"
                  : isDone ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/50"
                  : "bg-white border-[var(--color-border)]"
              }`}
            >
              {/* Timeline node : icône + couleur de la ligne */}
              <div className="flex flex-col items-center pt-0.5">
                <motion.div
                  layout
                  animate={{ scale: isActive ? 1.12 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                    isDone ? "bg-emerald-500 text-white" : "text-white"
                  }`}
                  style={!isDone ? { backgroundColor: lineColor || "#2E7D9B" } : {}}
                >
                  {isDone ? <CheckCircle2 size={18} /> : <ModeIcon size={18} />}
                </motion.div>
                {i < segments.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 min-h-[12px] mt-1 ${isDone ? "bg-emerald-300" : "bg-[var(--color-border)]"}`}
                  />
                )}
              </div>

              {/* Segment content */}
              <div className={`flex-1 min-w-0 ${isDone ? "opacity-60" : ""}`}>
                {/* Ligne 1 : mode badge + trajet */}
                <div className="flex items-center gap-2 flex-wrap">
                  {segment.type === "transit" && segment.lineName ? (
                    <ModeBadge
                      mode={segment.mode}
                      type={segment.type}
                      lineName={segment.lineName}
                      lineColor={lineColor}
                      size="md"
                    />
                  ) : (
                    <ModeBadge
                      mode={segment.mode}
                      type={segment.type}
                      size="md"
                      showLabel
                    />
                  )}
                  <span className={`text-sm font-medium truncate ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]"}`}>
                    {segment.type === "transit"
                      ? `${segment.fromStop} → ${segment.toStop}`
                      : segment.instruction}
                  </span>
                  {isActive && (
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-primary)] text-white shrink-0">
                      <CircleDot size={10} /> En cours
                    </span>
                  )}
                </div>

                {/* Ligne 2 : stats rapides (durée, arrêts, horaires) */}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-[var(--color-text-tertiary)]">
                  <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text-secondary)]">
                    <Clock size={11} />
                    {segment.durationMinutes} min
                  </span>
                  {segment.type !== "walking" && segment.numStops && (
                    <span className="inline-flex items-center gap-1">
                      <CircleDot size={11} />
                      {segment.numStops} arrêt{segment.numStops > 1 ? "s" : ""}
                    </span>
                  )}
                  {segment.departureTime && segment.arrivalTime && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Timer size={11} />
                      {segment.departureTime.slice(0, 5)} → {segment.arrivalTime.slice(0, 5)}
                    </span>
                  )}
                  {segment.distanceKm && segment.distanceKm > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <ArrowRight size={11} />
                      {(segment.distanceKm * 1000).toFixed(0)}m
                    </span>
                  )}
                </div>

                {/* Détails enrichis : direction, terminus, quai, attente */}
                {segment.type === "transit" && (segment.direction || segment.platform || segment.waitTimeMinutes !== undefined || segment.headsign) && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {segment.direction && (
                      <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                        <Navigation2 size={11} className="text-[var(--color-primary)] shrink-0" />
                        <span>Direction :</span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{segment.direction}</span>
                      </div>
                    )}
                    {segment.headsign && segment.headsign !== segment.direction && (
                      <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                        <MapPin size={11} className="text-[var(--color-mobility-orange)] shrink-0" />
                        <span>Terminus :</span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{segment.headsign}</span>
                      </div>
                    )}
                    {segment.platform && (
                      <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[var(--color-mobility-orange)]/15 text-[var(--color-mobility-orange)] text-[9px] font-bold shrink-0">P</span>
                        <span>{segment.platform}</span>
                      </div>
                    )}
                    {segment.waitTimeMinutes !== undefined && (
                      <div className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                        <Clock size={11} className="text-[var(--color-eco-green)] shrink-0" />
                        <span>Attente :</span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{segment.waitTimeMinutes} min</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Map */}
      <div className="rounded-[var(--card-radius)] h-48 mb-4 border border-[var(--color-border)] overflow-hidden">
        <DynamicMap
          center={mapCenter}
          zoom={isNavigating ? 16 : 13}
          markers={mapMarkers}
          polyline={tripPolyline.length > 0 ? tripPolyline : undefined}
          shapePolylines={shapePolylines}
          userPosition={userPosition ? { lat: userPosition.lat, lon: userPosition.lon, accuracy: accuracy ?? undefined } : undefined}
          onLocateUser={() => {}}
          isWatching={isNavigating}
          onToggleWatch={isNavigating ? stopNavigation : startNavigation}
          followUser={isNavigating}
        />
      </div>

      {/* CTA — Navigation mode */}
      <AnimatePresence mode="wait">
        {!isNavigating ? (
          <motion.button
            key="cta-start"
            onClick={startNavigation}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className="w-full h-[52px] rounded-[var(--cta-radius)] bg-[var(--color-primary)] text-white font-semibold text-base hover:bg-[var(--color-primary-dark)] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[var(--color-primary)]/20"
          >
            <motion.span
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex"
            >
              <Play size={18} />
            </motion.span>
            Démarrer le trajet
          </motion.button>
        ) : (
          <motion.div
            key="nav-active"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
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
              <p className="text-2xl font-bold font-mono">{formatTime(elapsedSeconds)}</p>
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
            <div className="bg-white rounded-[var(--card-radius)] p-3 border border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Étape en cours</p>
              <p className="text-sm font-medium text-[var(--color-primary)]">
                {segments[activeSegment].instruction}
              </p>
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                {segments[activeSegment].durationMinutes} min · Étape {activeSegment + 1}/{segments.length}
              </p>
            </div>
          )}

          {/* GPS info panel */}
          {userPosition && (
            <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-tertiary)]">Distance restante</span>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatDistance(remainingDistance)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[var(--color-text-tertiary)]">ETA</span>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {remainingTime > 0 ? `~${Math.ceil(remainingTime)} min` : "—"}
                </span>
              </div>
              {currentSpeed > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[var(--color-text-tertiary)]">Vitesse</span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {currentSpeed.toFixed(1)} km/h
                  </span>
                </div>
              )}
              {accuracy && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[var(--color-text-tertiary)]">Précision GPS</span>
                  <span className="text-[var(--color-text-tertiary)]">±{Math.round(accuracy)}m</span>
                </div>
              )}
            </div>
          )}

          {/* Off-route warning */}
          {offRoute && !arrived && (
            <div className="bg-amber-50 border border-amber-200 rounded-[var(--card-radius)] p-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Hors trajet</p>
                <p className="text-xs text-amber-600">Vous vous êtes écarté de l&apos;itinéraire</p>
              </div>
            </div>
          )}

          {/* Arrived notification */}
          {arrived && (
            <div className="bg-[var(--color-eco-green)]/10 border border-[var(--color-eco-green)]/30 rounded-[var(--card-radius)] p-3 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-[var(--color-eco-green)] shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--color-eco-green)]">Vous êtes arrivé !</p>
                <p className="text-xs text-[var(--color-eco-green)]/70">Destination atteinte</p>
              </div>
            </div>
          )}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}