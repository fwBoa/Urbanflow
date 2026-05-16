"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Clock, MapPin, Footprints, Bike, Train, Bus, ArrowRight, Leaf, Navigation2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
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

  // Build map markers from journey data
  const mapMarkers = trip
    ? [
        { position: [trip.segments[0]?.fromStop ? 48.8566 : 48.8566, 2.3522] as [number, number], label: departure, color: "#2E7D9B" },
        { position: [48.8925, 2.2375] as [number, number], label: arrival, color: "#E53935" },
      ]
    : [
        { position: [48.8606, 2.3456] as [number, number], label: "Châtelet", color: "#2E7D9B" },
        { position: [48.8925, 2.2375] as [number, number], label: "La Défense", color: "#E53935" },
      ];

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
        {segments.map((segment, i) => (
          <div key={i} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  segment.type === "walking"
                    ? "bg-[var(--color-surface)] text-[var(--color-text-tertiary)]"
                    : "text-white"
                }`}
                style={
                  segment.type !== "walking"
                    ? { backgroundColor: segment.lineColor || "var(--color-primary)" }
                    : {}
                }
              >
                {segment.type === "walking" ? (
                  <Footprints size={14} />
                ) : segment.type === "velib" ? (
                  <Bike size={14} />
                ) : (
                  <Train size={14} />
                )}
              </div>
              {i < segments.length - 1 && (
                <div className="w-0.5 h-12 bg-[var(--color-border)]" />
              )}
            </div>

            {/* Segment content */}
            <div className="flex-1 pb-4">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                {segment.instruction}
              </p>
              <div className="flex items-center gap-2 mt-1">
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
            </div>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="rounded-[var(--card-radius)] h-48 mb-4 border border-[var(--color-border)] overflow-hidden">
        <DynamicMap
          center={[48.8766, 2.2946]}
          zoom={13}
          markers={mapMarkers}
          polyline={
            mapMarkers.length >= 2
              ? [mapMarkers[0].position, mapMarkers[1].position]
              : undefined
          }
        />
      </div>

      {/* CTA */}
      <button className="w-full h-[52px] rounded-[var(--cta-radius)] bg-[var(--color-primary)] text-white font-semibold text-base hover:bg-[var(--color-primary-dark)] transition-colors active:scale-[0.98]">
        Démarrer le trajet
      </button>
    </AppShell>
  );
}