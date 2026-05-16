"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Leaf, Wallet, MapPin, Navigation, Clock, Loader2, Building2, Train, Bus, Bike } from "lucide-react";
import AppShell from "@/components/AppShell";
import SearchBar from "@/components/SearchBar";
import FilterChip from "@/components/FilterChip";
import TripCard from "@/components/TripCard";
import DynamicMap from "@/components/DynamicMap";
import { useStopSearch, useGeocode, useJourney } from "@/hooks/useTransport";
import { useGeolocation } from "@/hooks/useGeolocation";
import { addToHistory } from "@/services/favorites";
import type { PrimStop, GeocodeResult } from "@/services/api";

// ─── Types pour l'autocomplete fusionné ────────────────────────────────
type SuggestionItem =
  | { type: "stop"; data: PrimStop }
  | { type: "address"; data: GeocodeResult };

const filters = [
  { key: "fast", label: "Rapide", icon: <Zap size={14} /> },
  { key: "eco", label: "Éco", icon: <Leaf size={14} /> },
  { key: "cheap", label: "Économique", icon: <Wallet size={14} /> },
];

// Mode de transport icône selon le type d'arrêt
function getStopIcon(arrtype: string) {
  switch (arrtype) {
    case "metro": return <Train size={14} className="text-[var(--color-metro)]" />;
    case "bus": return <Bus size={14} className="text-[var(--color-bus)]" />;
    case "rer": return <Train size={14} className="text-[var(--color-rer)]" />;
    case "tram": return <Train size={14} className="text-[var(--color-tram)]" />;
    default: return <MapPin size={14} className="text-[var(--color-primary)]" />;
  }
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode") || "";

  // ─── Mode de transport depuis l'URL ──────────────────────────────────
  const modeLabels: Record<string, string> = {
    metro: "Métro",
    bus: "Bus",
    velo: "Vélib'",
    velib: "Vélib'",
    rer: "RER",
    tram: "Tram",
    trottinette: "Trottinette",
  };
  const modeTitle = modeParam ? modeLabels[modeParam] || modeParam : "";
  const isVelibMode = modeParam === "velib" || modeParam === "velo";

  const [activeFilter, setActiveFilter] = useState("fast");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedDest, setSelectedDest] = useState<{ lat: number; lon: number } | null>(null);

  // ─── Géolocalisation ─────────────────────────────────────────────────
  const { lat: userLat, lon: userLon, loading: geoLoading, error: geoError, locate } = useGeolocation();

  // Utiliser ma position comme origine
  const useMyPosition = () => {
    if (userLat && userLon) {
      setOrigin("Ma position");
      setSelectedOrigin({ lat: userLat, lon: userLon });
    } else {
      locate();
    }
  };

  // Recherche simultanée : arrêts PRIM + adresses
  const { stops: originStops } = useStopSearch(origin);
  const { results: originAddresses } = useGeocode(origin);
  const { stops: destStops } = useStopSearch(destination);
  const { results: destAddresses } = useGeocode(destination);

  const { journeys, loading: journeysLoading, error: journeysError } = useJourney(
    selectedOrigin,
    selectedDest,
  );

  // ─── Fusionner les suggestions : arrêts en premier, puis adresses ────
  const originSuggestions: SuggestionItem[] = useMemo(() => {
    const items: SuggestionItem[] = [];
    originStops.slice(0, 3).forEach((s) => items.push({ type: "stop", data: s }));
    originAddresses.slice(0, 3).forEach((a) => items.push({ type: "address", data: a }));
    return items;
  }, [originStops, originAddresses]);

  const destSuggestions: SuggestionItem[] = useMemo(() => {
    const items: SuggestionItem[] = [];
    destStops.slice(0, 3).forEach((s) => items.push({ type: "stop", data: s }));
    destAddresses.slice(0, 3).forEach((a) => items.push({ type: "address", data: a }));
    return items;
  }, [destStops, destAddresses]);

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

  // ─── Sélection d'une suggestion (arrêt ou adresse) ──────────────────
  const handleOriginSelect = (item: SuggestionItem) => {
    if (item.type === "stop") {
      setOrigin(item.data.arrname);
      setSelectedOrigin({ lat: item.data.arrgeopoint.lat, lon: item.data.arrgeopoint.lon });
    } else {
      setOrigin(item.data.label);
      setSelectedOrigin({ lat: item.data.geometry.coordinates[1], lon: item.data.geometry.coordinates[0] });
    }
  };

  const handleDestSelect = (item: SuggestionItem) => {
    if (item.type === "stop") {
      setDestination(item.data.arrname);
      setSelectedDest({ lat: item.data.arrgeopoint.lat, lon: item.data.arrgeopoint.lon });
    } else {
      setDestination(item.data.label);
      setSelectedDest({ lat: item.data.geometry.coordinates[1], lon: item.data.geometry.coordinates[0] });
    }
  };

  // ─── Réinitialiser un champ ─────────────────────────────────────────
  const clearOrigin = () => { setOrigin(""); setSelectedOrigin(null); };
  const clearDest = () => { setDestination(""); setSelectedDest(null); };

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

  // Handle trip click — save to history and navigate
  const handleTripClick = (journey: typeof journeys[0], index: number) => {
    const fromName = journey.segments[0]?.fromStop || "Départ";
    const toName = journey.segments[journey.segments.length - 1]?.toStop || "Arrivée";
    addToHistory({
      from: fromName,
      to: toName,
      mode: getModeLabel(journey),
      modeColor: getModeColor(journey),
      duration: `${journey.durationMinutes} min`,
      co2: journey.co2Ggrams,
    });
    router.push(`/trip/${index}?data=${encodeURIComponent(JSON.stringify(journey))}`);
  };

  // ─── Rendu d'une suggestion ────────────────────────────────────────
  const renderSuggestion = (item: SuggestionItem, index: number, onSelect: (item: SuggestionItem) => void, iconColor: string) => {
    if (item.type === "stop") {
      const stop = item.data;
      return (
        <button
          key={`stop-${stop.arrid}-${index}`}
          className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface)] text-sm flex items-center gap-2"
          onClick={() => onSelect(item)}
        >
          {getStopIcon(stop.arrtype)}
          <div className="flex-1 min-w-0">
            <span className="truncate block">{stop.arrname}</span>
            <span className="text-[var(--color-text-tertiary)] text-xs">{stop.arrtown} · Arrêt</span>
          </div>
        </button>
      );
    }
    const addr = item.data;
    return (
      <button
        key={`addr-${addr.label}-${index}`}
        className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface)] text-sm flex items-center gap-2"
        onClick={() => onSelect(item)}
      >
        <Building2 size={14} style={{ color: iconColor }} />
        <div className="flex-1 min-w-0">
          <span className="truncate block">{addr.label}</span>
          <span className="text-[var(--color-text-tertiary)] text-xs">{addr.postcode} {addr.city} · Adresse</span>
        </div>
      </button>
    );
  };

  return (
    <AppShell title={modeTitle ? modeTitle : "Recherche"} showBack>
      {/* Mode indicator badge */}
      {modeParam && (
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            {isVelibMode ? <Bike size={12} /> : <Train size={12} />}
            Mode : {modeTitle}
          </span>
          <button
            onClick={() => router.push("/search")}
            className="text-[var(--color-text-tertiary)] text-xs hover:text-[var(--color-text-primary)]"
          >
            Tous les modes
          </button>
        </div>
      )}
      {/* Search inputs */}
      <div className="space-y-3 mb-4">
        {/* Origin */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <SearchBar
                placeholder={isVelibMode ? "Station Vélib' proche de…" : modeTitle ? `Arrêt ${modeTitle} proche de…` : "D'où partez-vous ? (arrêt ou adresse)"}
                value={origin}
                onChange={(v) => { setOrigin(v); if (selectedOrigin) setSelectedOrigin(null); }}
              />
            </div>
            <button
              onClick={useMyPosition}
              className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-primary)]/10 transition-colors"
              aria-label="Utiliser ma position"
              title="Utiliser ma position"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>
            {selectedOrigin && (
              <button
                onClick={clearOrigin}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] px-1"
                aria-label="Effacer le départ"
              >
                ✕
              </button>
            )}
          </div>
          {/* Origin suggestions — fusionné arrêts + adresses */}
          {originSuggestions.length > 0 && !selectedOrigin && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] max-h-52 overflow-y-auto">
              {originStops.length > 0 && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                  🚉 Arrêts
                </div>
              )}
              {originSuggestions.filter(s => s.type === "stop").map((s, i) => renderSuggestion(s, i, handleOriginSelect, "#2E7D9B"))}
              {originAddresses.length > 0 && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider border-t border-[var(--color-border)]">
                  📍 Adresses
                </div>
              )}
              {originSuggestions.filter(s => s.type === "address").map((s, i) => renderSuggestion(s, i, handleOriginSelect, "#2E7D9B"))}
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <SearchBar
                placeholder={isVelibMode ? "Où voulez-vous aller en Vélib' ?" : modeTitle ? `Où allez-vous en ${modeTitle} ?` : "Où allez-vous ? (arrêt ou adresse)"}
                value={destination}
                onChange={(v) => { setDestination(v); if (selectedDest) setSelectedDest(null); }}
              />
            </div>
            {selectedDest && (
              <button
                onClick={clearDest}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] px-1"
                aria-label="Effacer la destination"
              >
                ✕
              </button>
            )}
          </div>
          {/* Destination suggestions — fusionné arrêts + adresses */}
          {destSuggestions.length > 0 && !selectedDest && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-[var(--color-border)] max-h-52 overflow-y-auto">
              {destStops.length > 0 && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                  🚉 Arrêts
                </div>
              )}
              {destSuggestions.filter(s => s.type === "stop").map((s, i) => renderSuggestion(s, i, handleDestSelect, "#FF6B35"))}
              {destAddresses.length > 0 && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider border-t border-[var(--color-border)]">
                  📍 Adresses
                </div>
              )}
              {destSuggestions.filter(s => s.type === "address").map((s, i) => renderSuggestion(s, i, handleDestSelect, "#FF6B35"))}
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
          userPosition={userLat && userLon ? { lat: userLat, lon: userLon } : null}
          onLocateUser={locate}
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
                onClick={() => handleTripClick(trip, i)}
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