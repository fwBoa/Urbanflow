"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Leaf, MapPin, Loader2, Train, Bus, Bike, AlertTriangle, AlertOctagon } from "lucide-react";
import AppShell from "@/components/AppShell";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import FilterChip from "@/components/FilterChip";
import TripCard from "@/components/TripCard";
import DynamicMap from "@/components/DynamicMap";
import NearbyStopDrawer from "@/components/NearbyStopDrawer";
import { journeyToSegments } from "@/components/journey-helpers";
import JourneyLineLazy from "@/components/JourneyLineLoader";
import { UI_MODE_COLORS } from "@/constants/mode-colors";
import { useStopSearch, useGeocode, useJourney, useReverseGeocode, useRoute, useNearbyStops, useStopTimes } from "@/hooks/useTransport";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { addToHistory } from "@/services/favorites";
import type { SuggestionItem } from "@/components/SearchAutocomplete";

const filters = [
  { key: "fast", label: "Rapide", icon: <Zap size={14} /> },
  { key: "eco", label: "Éco", icon: <Leaf size={14} /> },
];

const DEFAULT_MAP_CENTER: [number, number] = [48.8566, 2.3522];

export default function SearchPage() {
  return (
    <Suspense fallback={<AppShell title="Recherche"><div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-[var(--color-primary)]" size={32} /></div></AppShell>}>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
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
  };
  const modeTitle = modeParam ? modeLabels[modeParam] || modeParam : "";
  const isVelibMode = modeParam === "velib" || modeParam === "velo";

  const [activeFilter, setActiveFilter] = useState("fast");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [selectedOrigin, setSelectedOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedDest, setSelectedDest] = useState<{ lat: number; lon: number } | null>(null);

  // ─── Mode de transport sélectionné ──────────────────────────────────
  const [selectedModes, setSelectedModes] = useState<string[]>([]);

  const transportModes = [
    { key: "metro", label: "Métro", icon: <Train size={14} /> },
    { key: "rer", label: "RER", icon: <Train size={14} /> },
    { key: "bus", label: "Bus", icon: <Bus size={14} /> },
    { key: "tram", label: "Tram", icon: <Train size={14} /> },
    { key: "velib", label: "Vélib'", icon: <Bike size={14} /> },
    { key: "marche", label: "Marche", icon: <MapPin size={14} /> },
  ];

  const toggleMode = (mode: string) => {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  // ─── Géolocalisation ─────────────────────────────────────────────────
  const { lat: userLat, lon: userLon, accuracy: userAccuracy, watching: isWatching, locate, startWatch, stopWatch } = useGeolocation();
  const [followUser, setFollowUser] = useState(false);
  const { reverseGeocode } = useReverseGeocode();
  const { stops: nearbyStops, loading: nearbyLoading } = useNearbyStops(userLat, userLon, 0.5, 6);
  const { fetchRoute } = useRoute();
  const reducedMotion = usePrefersReducedMotion();

  // Erreur si la position GPS est hors de la zone couverte
  const [positionError, setPositionError] = useState<string | null>(null);

  // ─── Drawer prochains départs ────────────────────────────────────────
  const [selectedNearbyStop, setSelectedNearbyStop] = useState<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    lines: Array<{ id: string; name: string; color: string }>;
  } | null>(null);
  const { departures: stopDepartures, loading: stopTimesLoading } = useStopTimes(
    selectedNearbyStop?.id ?? null,
    5,
  );

  // Distance haversine (km) entre deux points GPS
  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Toggle suivi GPS continu
  const toggleWatch = useCallback(() => {
    if (isWatching) {
      stopWatch();
      setFollowUser(false);
    } else {
      startWatch();
      setFollowUser(true);
    }
  }, [isWatching, startWatch, stopWatch]);

  // Utiliser ma position comme origine — bloqué si hors zone (>>15 km de Paris)
  const useMyPosition = () => {
    setPositionError(null);
    if (userLat && userLon) {
      const dist = haversineKm(userLat, userLon, 48.8566, 2.3522);
      if (dist > 15) {
        setPositionError(
          `Votre position est à ${Math.round(dist)} km de Paris. UrbanFlow couvre uniquement Paris et sa proche banlieue (≤ 15 km).`,
        );
        return;
      }
      setOrigin("Ma position");
      setSelectedOrigin({ lat: userLat, lon: userLon });
    } else {
      locate();
    }
  };

  // ─── Clic sur la carte → reverse geocoding ──────────────────────────
  const [mapClickError, setMapClickError] = useState<string | null>(null);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setMapClickError(null);
    const result = await reverseGeocode(lat, lng);
    const label = result?.label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    // Bloquer la sélection si hors de Paris (sauf si c'est un arrêt GTFS connu)
    if (result && !result.isParis) {
      setMapClickError("Hors de Paris — sélectionnez une adresse à Paris");
      return;
    }

    // Si pas d'origine → définir comme départ, sinon comme destination
    if (!selectedOrigin) {
      setOrigin(label);
      setSelectedOrigin({ lat, lon: lng });
    } else if (!selectedDest) {
      setDestination(label);
      setSelectedDest({ lat, lon: lng });
    } else {
      // Les deux sont remplis → remplacer la destination
      setDestination(label);
      setSelectedDest({ lat, lon: lng });
    }
  }, [selectedOrigin, selectedDest, reverseGeocode]);

  // Recherche simultanée : arrêts PRIM + adresses
  const { stops: originStops } = useStopSearch(origin);
  const { results: originAddresses } = useGeocode(origin);
  const { stops: destStops } = useStopSearch(destination);
  const { results: destAddresses } = useGeocode(destination);

  const { journeys, loading: journeysLoading, error: journeysError } = useJourney(
    selectedOrigin,
    selectedDest,
    undefined,
    selectedModes.length > 0 ? selectedModes : undefined,
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

  // Build polyline from OSRM route (real geometry) or fallback to straight line
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);

  const fallbackPolyline = useMemo(() => {
    if (mapMarkers.length >= 2) return mapMarkers.map((m) => m.position);
    return [];
  }, [mapMarkers]);

  useEffect(() => {
    if (!selectedOrigin || !selectedDest) return;
    let cancelled = false;
    fetchRoute(selectedOrigin.lat, selectedOrigin.lon, selectedDest.lat, selectedDest.lon, 'foot')
      .then((coords) => {
        if (cancelled) return;
        if (coords.length > 0) {
          setRoutePolyline(coords);
        } else {
          setRoutePolyline([
            [selectedOrigin.lat, selectedOrigin.lon],
            [selectedDest.lat, selectedDest.lon],
          ]);
        }
      });
    return () => { cancelled = true; };
  }, [selectedOrigin, selectedDest, fetchRoute]);

  const mapPolyline = routePolyline.length > 0 ? routePolyline : fallbackPolyline;

  // Sort journeys based on active filter
  const sortedJourneys = useMemo(() => {
    const sorted = [...journeys];
    switch (activeFilter) {
      case "fast":
        return sorted.sort((a, b) => a.durationMinutes - b.durationMinutes);
      case "eco":
        return sorted.sort((a, b) => a.co2Ggrams - b.co2Ggrams);
      default:
        return sorted;
    }
  }, [journeys, activeFilter]);

  // ── Tracé animé multi-segments depuis le meilleur itinéraire ──
  // On prend le 1er itinéraire de la liste (le plus rapide après tri)
  const journeySegments = useMemo(() => {
    if (!selectedOrigin || !selectedDest || sortedJourneys.length === 0) return [];
    const best = sortedJourneys[0];
    return journeyToSegments(
      best,
      selectedOrigin.lat,
      selectedOrigin.lon,
      selectedDest.lat,
      selectedDest.lon
    );
  }, [sortedJourneys, selectedOrigin, selectedDest]);

  // ── Instance Leaflet (récupérée via onMapReady) ──
  const [mapInstance, setMapInstance] = useState<unknown>(null);

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
    if (velibSegments.length > 0 && transitSegments.length === 0) return UI_MODE_COLORS.velib;
    if (transitSegments.length === 0) return UI_MODE_COLORS.marche;
    return transitSegments[0]?.lineColor || UI_MODE_COLORS.metro;
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
    // Store bulky journey state in sessionStorage instead of URL query string
    // to avoid exceeding browser/proxy URL length limits (Kaizen).
    const tripKey = `uf:trip:${index}`;
    try {
      sessionStorage.setItem(tripKey, JSON.stringify(journey));
    } catch {
      // best-effort: if storage fails, we still keep origin/dest coords in URL
    }
    // Pass only origin/dest coordinates in URL for real routing on trip page
    const query = new URLSearchParams();
    if (selectedOrigin) {
      query.set("originLat", String(selectedOrigin.lat));
      query.set("originLon", String(selectedOrigin.lon));
    }
    if (selectedDest) {
      query.set("destLat", String(selectedDest.lat));
      query.set("destLon", String(selectedDest.lon));
    }
    router.push(`/trip/${index}?${query.toString()}`);
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
      {/* Message d'erreur carte hors Paris */}
      {mapClickError && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-mobility-orange)]/10 border border-[var(--color-mobility-orange)] text-xs text-[var(--color-mobility-orange)] flex items-center gap-2">
          <AlertTriangle size={14} />
          {mapClickError}
        </div>
      )}

      {/* Arrêts proches — position GPS */}
      {userLat && userLon && (
        <div className="mb-3">
          {nearbyLoading && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <Loader2 size={12} className="animate-spin" />
              Recherche des arrêts proches...
            </div>
          )}
          {!nearbyLoading && nearbyStops.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                🚉 Autour de vous
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {nearbyStops.map((stop) => (
                  <button
                    key={stop.id}
                    onClick={() => setSelectedNearbyStop(stop)}
                    className="shrink-0 flex flex-col items-start px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors text-left"
                  >
                    <span className="text-xs font-medium text-[var(--color-text-primary)] truncate max-w-[140px]">
                      {stop.name}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      {stop.lines.slice(0, 2).map((l) => l.name).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search inputs */}
      <div className="space-y-3 mb-4">
        {/* Origin */}
        <SearchAutocomplete
          placeholder={isVelibMode ? "Station Vélib' proche de…" : modeTitle ? `Arrêt ${modeTitle} proche de…` : "D'où partez-vous ? (arrêt ou adresse)"}
          value={origin}
          onChange={(v) => { setOrigin(v); if (selectedOrigin) setSelectedOrigin(null); }}
          onSelect={handleOriginSelect}
          onSubmit={() => {}}
          stopSuggestions={originStops}
          addressSuggestions={originAddresses}
          addressIconColor="#2E7D9B"
          isLoading={false}
          rightElement={
            <button
              type="button"
              onClick={useMyPosition}
              className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
              aria-label="Utiliser ma position"
              title="Utiliser ma position"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>
          }
        />

        {/* Message d'erreur si position hors zone */}
        {positionError && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            {positionError}
          </div>
        )}

        {/* Destination */}
        <SearchAutocomplete
          placeholder={isVelibMode ? "Où voulez-vous aller en Vélib' ?" : modeTitle ? `Où allez-vous en ${modeTitle} ?` : "Où allez-vous ? (arrêt ou adresse)"}
          value={destination}
          onChange={(v) => { setDestination(v); if (selectedDest) setSelectedDest(null); }}
          onSelect={handleDestSelect}
          onSubmit={() => {}}
          stopSuggestions={destStops}
          addressSuggestions={destAddresses}
          addressIconColor="#FF6B35"
          isLoading={false}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1" role="group" aria-label="Trier les résultats">
        {filters.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            icon={f.icon}
            variant="filter"
            active={activeFilter === f.key}
            onClick={() => setActiveFilter(f.key)}
          />
        ))}
      </div>

      {/* Transport mode selection */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1" role="group" aria-label="Filtrer par mode de transport">
        {transportModes.map((m) => (
          <FilterChip
            key={m.key}
            label={m.label}
            icon={m.icon}
            variant="mode"
            active={selectedModes.includes(m.key)}
            onClick={() => toggleMode(m.key)}
          />
        ))}
      </div>

      {/* Map */}
      <div className="rounded-[var(--card-radius)] h-40 mb-4 border border-[var(--color-border)] overflow-hidden">
        <DynamicMap
          center={DEFAULT_MAP_CENTER}
          zoom={12}
          markers={mapMarkers.length > 0 ? mapMarkers : [
            { position: [48.8606, 2.3456], label: "Châtelet", color: "#2E7D9B" },
            { position: [48.8925, 2.2375], label: "La Défense", color: "#E53935" },
          ]}
          polyline={mapPolyline}
          userPosition={userLat && userLon ? { lat: userLat, lon: userLon, accuracy: userAccuracy ?? undefined } : null}
          onLocateUser={locate}
          isWatching={isWatching}
          onToggleWatch={toggleWatch}
          followUser={followUser}
          onMapClick={handleMapClick}
          onMapReady={setMapInstance}
        />
      </div>
      {/* Tracé animé multi-segments (au-dessus de la carte) */}
      {journeySegments.length > 0 && (
        <JourneyLineLazy
          map={mapInstance}
          segments={journeySegments}
          animateDash={!reducedMotion}
          duration={reducedMotion ? 0 : 1.4}
        />
      )}
      {/* Click-on-map hint */}
      {(!selectedOrigin || !selectedDest) && (
        <p className="text-[var(--color-text-tertiary)] text-xs text-center mb-3">
          💡 Cliquez sur la carte pour définir {!selectedOrigin ? "le départ" : "l'arrivée"}
        </p>
      )}

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

        {!journeysLoading && !journeysError && sortedJourneys.length === 0 && selectedOrigin && selectedDest && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--card-radius)] p-4 text-sm text-[var(--color-text-secondary)] text-center">
            <MapPin size={20} className="mx-auto mb-2 text-[var(--color-text-tertiary)]" />
            <p className="font-medium">Aucun itinéraire trouvé</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              Vérifiez que votre départ et votre arrivée sont à Paris ou en proche banlieue.
            </p>
          </div>
        )}

        {!journeysLoading && !journeysError && sortedJourneys.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {sortedJourneys.length} itinéraire{sortedJourneys.length > 1 ? "s" : ""} trouvé{sortedJourneys.length > 1 ? "s" : ""}
              </h2>
              {sortedJourneys.some((t) => t.isFallback) && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium" title="Données temps réel indisponibles — itinéraires estimés">
                  ⚠️ Estimé
                </span>
              )}
            </div>
            {sortedJourneys.some((t) => t.isFallback) && (
              <div className="bg-amber-50 border border-amber-200 rounded-[var(--card-radius)] p-2.5 text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/30 dark:text-amber-300">
                <span className="font-semibold">Données GTFS indisponibles.</span> Les itinéraires affichés sont des estimations basées sur la distance. Les horaires et lignes réelles seront disponibles une fois le service PRIM de retour.
              </div>
            )}
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
                hasAlert={!!trip.alerts && trip.alerts.length > 0}
                alertCount={trip.alerts?.length}
                onClick={() => handleTripClick(trip, i)}
              />
            ))}
          </>
        )}

        {/* ─── Empty state / Erreurs enrichies ────────────────────────── */}
        {selectedOrigin && selectedDest && journeysError && (
          <div className="bg-red-50 border border-red-200 rounded-[var(--card-radius)] p-4 flex items-start gap-3" role="alert">
            <AlertOctagon size={20} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Impossible de calculer l&apos;itinéraire</p>
              <p className="text-xs text-red-700 mt-0.5">
                {journeysError || "Le service est temporairement indisponible. Réessayez dans quelques instants."}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-md bg-red-100 text-red-800 text-xs font-medium hover:bg-red-200 transition-colors"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {selectedOrigin && selectedDest && !journeysLoading && !journeysError && journeys.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-[var(--card-radius)] p-4 flex items-start gap-3" role="alert">
            <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Aucun itinéraire trouvé</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Vérifiez que vos points sont bien à Paris ou en proche banlieue (≤ 30 km du centre).
                Pour les longues distances, essayez d&apos;autres modes (train, marche).
              </p>
            </div>
          </div>
        )}

        {!journeysLoading && !journeysError && (!selectedOrigin || !selectedDest) && (
          <div className="text-center py-8 text-[var(--color-text-tertiary)]">
            <MapPin size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sélectionnez un départ et une destination</p>
          </div>
        )}
      </div>

      {/* ─── Drawer prochains départs ────────────────────────────────── */}
      <NearbyStopDrawer
        stop={selectedNearbyStop}
        departures={stopDepartures}
        loading={stopTimesLoading}
        onClose={() => setSelectedNearbyStop(null)}
        onUseAsOrigin={(s) => {
          setOrigin(s.name);
          setSelectedOrigin({ lat: s.lat, lon: s.lon });
          setSelectedNearbyStop(null);
        }}
      />
    </AppShell>
  );
}