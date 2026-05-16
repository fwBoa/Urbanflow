"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Zap, Leaf, Wallet, MapPin, Navigation, Clock, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import SearchBar from "@/components/SearchBar";
import FilterChip from "@/components/FilterChip";
import TripCard from "@/components/TripCard";
import DynamicMap from "@/components/DynamicMap";
import { useStopSearch, useJourney } from "@/hooks/useTransport";

const filters = [
  { key: "fast", label: "Rapide", icon: <Zap size={14} /> },
  { key: "eco", label: "Éco", icon: <Leaf size={14} /> },
  { key: "cheap", label: "Économique", icon: <Wallet size={14} /> },
];

export default function SearchPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("fast");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedDest, setSelectedDest] = useState<{ lat: number; lon: number } | null>(null);
  const { stops: originStops } = useStopSearch(origin);
  const { stops: destStops } = useStopSearch(destination);
  const { journeys, loading: journeysLoading, error: journeysError } = useJourney(
    selectedOrigin,
    selectedDest,
  );

  // Build map markers from search results
  const mapMarkers = useMemo(() => {
    const markers: Array<{ position: [number, number]; label: string; color: string }> = [];
    if (selectedOrigin) {
      markers.push({
        position: [selectedOrigin.lat, selectedOrigin.lon],
        label: origin || "Départ",
        color: "#2E7D9B",
      });
    } else if (originStops.length > 0) {
      markers.push({
        position: [originStops[0].arrgeopoint.lat, originStops[0].arrgeopoint.lon],
        label: originStops[0].arrname,
        color: "#2E7D9B",
      });
    }
    if (selectedDest) {
      markers.push({
        position: [selectedDest.lat, selectedDest.lon],
        label: destination || "Arrivée",
        color: "#E53935",
      });
    } else if (destStops.length > 0) {
      markers.push({
        position: [destStops[0].arrgeopoint.lat, destStops[0].arrgeopoint.lon],
        label: destStops[0].arrname,
        color: "#E53935",
      });
    }
    return markers;
  }, [selectedOrigin, selectedDest, originStops, destStops, origin, destination]);

  // Build polyline from journey segments
  const mapPolyline = useMemo(() => {
    if (journeys.length > 0 && selectedOrigin && selectedDest) {
      // Use origin → destination straight line for now
      return [
        [selectedOrigin.lat, selectedOrigin.lon] as [number, number],
        [selectedDest.lat, selectedDest.lon] as [number, number],
      ];
    }
    if (mapMarkers.length >= 2) {
      return mapMarkers.map((m) => m.position);
    }
    return undefined;
  }, [journeys, selectedOrigin, selectedDest, mapMarkers]);

  // Handle stop selection
  const handleOriginSelect = (stop: typeof originStops[0]) => {
    setOrigin(stop.arrname);
    setSelectedOrigin({ lat: stop.arrgeopoint.lat, lon: stop.arrgeopoint.lon });
  };

  const handleDestSelect = (stop: typeof destStops[0]) => {
    setDestination(stop.arrname);
    setSelectedDest({ lat: stop.arrgeopoint.lat, lon: stop.arrgeopoint.lon });
  };

  // Sort journeys based on active filter
  const sortedJourneys = useMemo(() => {
    const sorted = [...journeys];
    switch (activeFilter) {
      case "fast":
        return sorted.sort((a, b) => a.durationMinutes - b.durationMinutes);
      case "eco":
        return sorted.sort((a, b) => a.co2Ggrams - b.co2Ggrams);
      case "cheap":
        return sorted.sort((a, b) => a.co2Ggrams - b.co2Ggrams);
      default:
        return sorted;
    }
  }, [journeys, activeFilter]);

  // Get mode label from segments
  const getModeLabel = (journey: typeof journeys[0]) => {
    const transitSegments = journey.segments.filter((s) => s.type === "transit");
    const velibSegments = journey.segments.filter((s) => s.type === "velib");
    if (velibSegments.length > 0 && transitSegments.length === 0) return "Vélib'";
    if (transitSegments.length === 0) return "Marche";
    return transitSegments.map((s) => s.lineName || s.mode || "Transit").join(" + ");
  };

  const getModeColor = (journey: typeof journeys[0]) => {
    const transitSegments = journey.segments.filter((s) => s.type === "transit");
    const velibSegments = journey.segments.filter((s) => s.type === "velib");
    if (velibSegments.length > 0 && transitSegments.length === 0) return "#7CB342";
    if (transitSegments.length === 0) return "#9E9E9E";
    return transitSegments[0]?.lineColor || "#2E7D9B";
  };

  return (
    <AppShell title="Recherche" showBack>
      {/* Search inputs */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <SearchBar
            placeholder="D'où partez-vous ?"
            value={origin}
            onChange={setOrigin}
          />
          {/* Origin suggestions */}
          {originStops.length > 0 && !selectedOrigin && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] max-h-40 overflow-y-auto">
              {originStops.slice(0, 5).map((stop) => (
                <button
                  key={stop.arrid}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface)] text-sm flex items-center gap-2"
                  onClick={() => handleOriginSelect(stop)}
                >
                  <MapPin size={14} className="text-[var(--color-primary)]" />
                  <span>{stop.arrname}</span>
                  <span className="text-[var(--color-text-tertiary)] text-xs">{stop.arrtown}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <SearchBar
            placeholder="Où allez-vous ?"
            value={destination}
            onChange={setDestination}
          />
          {/* Destination suggestions */}
          {destStops.length > 0 && !selectedDest && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] max-h-40 overflow-y-auto">
              {destStops.slice(0, 5).map((stop) => (
                <button
                  key={stop.arrid}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface)] text-sm flex items-center gap-2"
                  onClick={() => handleDestSelect(stop)}
                >
                  <Navigation size={14} className="text-[var(--color-mobility-orange)]" />
                  <span>{stop.arrname}</span>
                  <span className="text-[var(--color-text-tertiary)] text-xs">{stop.arrtown}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {filters.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            icon={f.icon}
            active={activeFilter === f.key}
            onClick={() => setActiveFilter(f.key)}
          />
        ))}
      </div>

      {/* Map */}
      <div className="rounded-[var(--card-radius)] h-40 mb-4 border border-[var(--color-border)] overflow-hidden">
        <DynamicMap
          center={[48.8566, 2.3522]}
          zoom={12}
          markers={mapMarkers.length > 0 ? mapMarkers : [
            { position: [48.8606, 2.3456], label: "Châtelet", color: "#2E7D9B" },
            { position: [48.8925, 2.2375], label: "La Défense", color: "#E53935" },
          ]}
          polyline={mapPolyline}
        />
      </div>

      {/* Results */}
      <div className="space-y-3">
        {journeysLoading && selectedOrigin && selectedDest && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-[var(--color-primary)] mr-2" size={20} />
            <span className="text-[var(--color-text-secondary)]">Recherche d&apos;itinéraires...</span>
          </div>
        )}

        {journeysError && (
          <div className="bg-red-50 border border-red-200 rounded-[var(--card-radius)] p-3 text-sm text-red-700">
            Erreur : {journeysError}
          </div>
        )}

        {!journeysLoading && !journeysError && sortedJourneys.length > 0 && (
          <>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {sortedJourneys.length} itinéraire{sortedJourneys.length > 1 ? "s" : ""} trouvé{sortedJourneys.length > 1 ? "s" : ""}
            </h2>
            {sortedJourneys.map((trip, i) => (
              <TripCard
                key={i}
                departure={trip.segments[0]?.fromStop || "Départ"}
                arrival={trip.segments[trip.segments.length - 1]?.toStop || "Arrivée"}
                duration={`${trip.durationMinutes} min`}
                transfers={trip.transfers}
                co2={trip.co2Ggrams}
                mode={getModeLabel(trip)}
                modeColor={getModeColor(trip)}
                onClick={() => router.push(`/trip/${i}?data=${encodeURIComponent(JSON.stringify(trip))}`)}
              />
            ))}
          </>
        )}

        {!journeysLoading && !journeysError && (!selectedOrigin || !selectedDest) && (
          <div className="text-center py-8 text-[var(--color-text-tertiary)]">
            <MapPin size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sélectionnez un départ et une destination</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}