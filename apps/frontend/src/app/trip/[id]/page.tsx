"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Clock, MapPin, Footprints, Bike, Train, Bus, Leaf, Navigation2, Pause, Square, Play, AlertTriangle, CheckCircle2, ChevronUp, ChevronDown } from "lucide-react";
import AppShell from "@/components/AppShell";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
import { useRoute } from "@/hooks/useTransport";
import { useNavigation } from "@/hooks/useNavigation";
import type { JourneyResult } from "@/services/api";

const modeIcons: Record<string, React.ReactNode> = {
  metro: <Train size={18} />,
  bus: <Bus size={18} />,
  rer: <Train size={18} />,
  tram: <Train size={18} />,
  marche: <Footprints size={18} />,
  velib: <Bike size={18} />,
};

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
  const departure = firstSeg?.fromStop || firstSeg?.instruction?.split(" ").slice(-1)[0] || "Départ";
  const arrival = lastSeg?.toStop || lastSeg?.instruction?.split(" ").slice(-1)[0] || "Arrivée";
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
      <div className="bg-[var(--color-primary)] rounded-[var(--card-radius)] p-4 text-white mb-4">
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
      </div>

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

      {/* Timeline */}
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
        Détail du trajet
      </h2>
      <div className="space-y-0">
        {segments.map((segment, i) => {
          const isActive = isNavigating && i === activeSegment;
          const isDone = isNavigating && i < activeSegment;
          return (
            <div key={i} className="flex gap-3">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    isActive
                      ? "ring-2 ring-[var(--color-primary)] ring-offset-2 scale-110"
                      : ""
                  } ${
                    isDone
                      ? "bg-[var(--color-eco-green)] text-white"
                      : segment.type === "walking"
                        ? "bg-[var(--color-surface)] text-[var(--color-text-tertiary)]"
                        : "text-white"
                  }`}
                  style={
                    !isDone && segment.type !== "walking"
                      ? { backgroundColor: segment.lineColor || "var(--color-primary)" }
                      : isDone ? {} : {}
                  }
                >
                  {isDone ? (
                    <span className="text-xs">✓</span>
                  ) : segment.type === "walking" ? (
                    <Footprints size={14} />
                  ) : segment.type === "velib" ? (
                    <Bike size={14} />
                  ) : (
                    <Train size={14} />
                  )}
                </div>
                {i < segments.length - 1 && (
                  <div className={`w-0.5 h-12 ${isDone ? "bg-[var(--color-eco-green)]" : "bg-[var(--color-border)]"}`} />
                )}
              </div>

              {/* Segment content */}
              <div className={`flex-1 pb-4 transition-opacity ${isDone ? "opacity-50" : isActive ? "opacity-100" : "opacity-80"}`}>
                <p className={`text-sm font-medium ${isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]"}`}>
                  {segment.instruction}
                  {isActive && <span className="ml-2 text-xs text-[var(--color-primary)] font-normal">← En cours</span>}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1">
                    <Clock size={11} />
                    {segment.durationMinutes} min
                  </span>
                  {segment.type !== "walking" && segment.numStops && (
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">
                      {segment.numStops} arrêts
                    </span>
                  )}
                </div>
                {/* ─── Détails enrichis (direction, quai, attente) ──────────── */}
                {segment.type === "transit" && (segment.direction || segment.platform || segment.waitTimeMinutes) && (
                  <div className="mt-2 bg-[var(--color-surface)] rounded-lg p-2 space-y-1">
                    {segment.direction && (
                      <p className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
                        <Navigation2 size={10} className="text-[var(--color-primary)]" />
                        Direction : <span className="font-medium">{segment.direction}</span>
                      </p>
                    )}
                    {segment.platform && (
                      <p className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
                        <MapPin size={10} className="text-[var(--color-mobility-orange)]" />
                        {segment.platform}
                      </p>
                    )}
                    {segment.waitTimeMinutes && (
                      <p className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
                        <Clock size={10} className="text-[var(--color-eco-green)]" />
                        Attente estimée : <span className="font-medium">{segment.waitTimeMinutes} min</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Map */}
      <div className="rounded-[var(--card-radius)] h-48 mb-4 border border-[var(--color-border)] overflow-hidden">
        <DynamicMap
          center={mapCenter}
          zoom={isNavigating ? 16 : 13}
          markers={mapMarkers}
          polyline={tripPolyline.length > 0 ? tripPolyline : undefined}
          userPosition={userPosition ? { lat: userPosition.lat, lon: userPosition.lon, accuracy: accuracy ?? undefined } : undefined}
          onLocateUser={() => {}}
          isWatching={isNavigating}
          onToggleWatch={isNavigating ? stopNavigation : startNavigation}
          followUser={isNavigating}
        />
      </div>

      {/* CTA — Navigation mode */}
      {!isNavigating ? (
        <button
          onClick={startNavigation}
          className="w-full h-[52px] rounded-[var(--cta-radius)] bg-[var(--color-primary)] text-white font-semibold text-base hover:bg-[var(--color-primary-dark)] transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Play size={18} />
          Démarrer le trajet
        </button>
      ) : (
        <div className="space-y-3">
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
        </div>
      )}
    </AppShell>
  );
}