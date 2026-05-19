"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Bike, Navigation, Clock, ChevronRight, CheckCircle, AlertCircle, Locate, Zap, Battery } from "lucide-react";
import NavBar from "@/components/NavBar";
import SearchBar from "@/components/SearchBar";
import TransportCard from "@/components/TransportCard";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
import { useVelibStations, useTransportModes, useLinesByMode, useNearbyVelib } from "@/hooks/useTransport";
import type { TransportMode, LineByMode, LinesByMode, NearbyVelibStation } from "@/hooks/useTransport";

// ─── Lines by Mode Section ────────────────────────────────────────────
const MODE_TABS = [
  { key: "metro" as const, label: "Métro", emoji: "🚇" },
  { key: "rer" as const, label: "RER", emoji: "🚉" },
  { key: "tram" as const, label: "Tram", emoji: "🚊" },
  { key: "transilien" as const, label: "Transilien", emoji: "🚆" },
];

function LinesByModeSection({ linesByMode, loading }: { linesByMode: LinesByMode; loading: boolean }) {
  const [activeTab, setActiveTab] = useState<keyof LinesByMode>("metro");

  if (loading) {
    return (
      <div className="mb-6">
        <div className="flex gap-2 mb-3">
          {MODE_TABS.map((tab) => (
            <span key={tab.key} className="px-3 py-1.5 rounded-full bg-[var(--color-border)] text-[12px] text-[var(--color-text-tertiary)]">
              {tab.emoji} {tab.label}
            </span>
          ))}
        </div>
        <div className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">
          Chargement des lignes...
        </div>
      </div>
    );
  }

  const lines = linesByMode[activeTab] || [];

  return (
    <div className="mb-6">
      {/* Mode tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto">
        {MODE_TABS.map((tab) => {
          const count = (linesByMode[tab.key] || []).length;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary)]/10"
              }`}
            >
              {tab.emoji} {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Lines grid */}
      {lines.length === 0 ? (
        <div className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">
          Aucune ligne disponible
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {lines.map((line) => (
            <LineBadge key={line.id} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function LineBadge({ line }: { line: LineByMode }) {
  const isActive = line.status === "active";
  const isUpcoming = line.status === "prochainement active";

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] hover:shadow-sm transition-shadow cursor-default"
      title={`${line.shortName} — ${line.status}`}
    >
      <span
        className="inline-flex items-center justify-center min-w-[28px] h-[22px] px-1 rounded text-[11px] font-bold text-white"
        style={{ backgroundColor: `#${line.color}` }}
      >
        {line.shortName}
      </span>
      {isActive && <CheckCircle size={12} className="text-[var(--color-eco-green)]" />}
      {isUpcoming && <AlertCircle size={12} className="text-[var(--color-mobility-orange)]" />}
    </div>
  );
}

// Fallback modes when API is loading or unavailable
const fallbackModes: TransportMode[] = [
  { key: "metro", label: "Métro", emoji: "🚇", color: "#2E7D9B", count: 16, activeCount: 16, lines: [] },
  { key: "bus", label: "Bus", emoji: "🚌", color: "#FF9800", count: 2062, activeCount: 2062, lines: [] },
  { key: "velib", label: "Vélib'", emoji: "🚲", color: "#7CB342", count: 1400, activeCount: 1400, lines: [] },
  { key: "rer", label: "RER", emoji: "🚉", color: "#FF6B35", count: 5, activeCount: 5, lines: [] },
  { key: "tram", label: "Tram", emoji: "🚊", color: "#9C27B0", count: 12, activeCount: 12, lines: [] },
  { key: "transilien", label: "Transilien", emoji: "🚆", color: "#7CB342", count: 9, activeCount: 9, lines: [] },
];

// Vélib' is not a PRIM line mode, so we add it manually
const velibMode: TransportMode = {
  key: "velib",
  label: "Vélib'",
  emoji: "🚲",
  color: "#7CB342",
  count: 1400,
  activeCount: 1400,
  lines: [],
};

// ─── Vélib' proches Section (F4) ──────────────────────────────────────
function NearbyVelibSection({ stations, loading, error, onRequestLocation }: {
  stations: NearbyVelibStation[];
  loading: boolean;
  error: string | null;
  onRequestLocation: () => void;
}) {
  if (loading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Bike size={18} className="text-[var(--color-eco-green)]" />
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Vélib&apos; proches
          </h2>
          <span className="text-[11px] text-[var(--color-text-tertiary)] animate-pulse">Localisation…</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-[var(--color-border)] rounded-[var(--card-radius)] h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (error && stations.length === 0) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Bike size={18} className="text-[var(--color-eco-green)]" />
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Vélib&apos; proches
          </h2>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{error}</p>
          <button
            onClick={onRequestLocation}
            className="px-4 py-2 rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-medium hover:bg-[#6DA33A] transition-colors"
          >
            <Locate size={14} className="inline mr-1" />
            Activer la localisation
          </button>
        </div>
      </div>
    );
  }

  if (stations.length === 0) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Bike size={18} className="text-[var(--color-eco-green)]" />
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Vélib&apos; proches
          </h2>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
            Aucune station Vélib&apos; trouvée à proximité
          </p>
          <button
            onClick={onRequestLocation}
            className="px-4 py-2 rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-medium hover:bg-[#6DA33A] transition-colors"
          >
            <Locate size={14} className="inline mr-1" />
            Localiser
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Bike size={18} className="text-[var(--color-eco-green)]" />
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Vélib&apos; proches
        </h2>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {stations.length} station{stations.length > 1 ? "s" : ""} · 2 km
        </span>
      </div>
      <div className="space-y-2">
        {stations.map((station) => (
          <VelibStationCard key={station.id} station={station} />
        ))}
      </div>
    </div>
  );
}

function VelibStationCard({ station }: { station: NearbyVelibStation }) {
  const distText =
    station.distance < 1000
      ? `${station.distance} m`
      : `${(station.distance / 1000).toFixed(1)} km`;

  const bikeColor =
    station.available_bikes > 5
      ? "text-[var(--color-eco-green)]"
      : station.available_bikes > 0
        ? "text-[var(--color-mobility-orange)]"
        : "text-[var(--color-favorite-red)]";

  return (
    <div className="flex items-center gap-3 bg-white rounded-[var(--card-radius)] p-3 border border-[var(--color-border)] hover:shadow-sm transition-all">
      {/* Distance badge */}
      <div className="flex flex-col items-center min-w-[48px]">
        <span className="text-[13px] font-bold text-[var(--color-primary)]">{distText}</span>
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          {station.arrondissement}
        </span>
      </div>

      {/* Station info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {station.name}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className={`text-[12px] font-semibold ${bikeColor} flex items-center gap-0.5`}>
            <Bike size={12} />
            {station.available_bikes}
          </span>
          {station.available_ebikes > 0 && (
            <span className="text-[11px] text-[var(--color-primary)] flex items-center gap-0.5">
              <Zap size={11} />
              {station.available_ebikes}
            </span>
          )}
          <span className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-0.5">
            <Battery size={11} />
            {station.available_bike_stands} places
          </span>
        </div>
      </div>

      {/* Availability indicator */}
      <div className="flex flex-col items-center">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
            station.available_bikes > 5
              ? "bg-[var(--color-eco-green)]"
              : station.available_bikes > 0
                ? "bg-[var(--color-mobility-orange)]"
                : "bg-[var(--color-favorite-red)]"
          }`}
        >
          {station.available_bikes}
        </div>
        <span className="text-[9px] text-[var(--color-text-tertiary)] mt-0.5">vélos</span>
      </div>
    </div>
  );
}

const recentTrips = [
  { from: "Maison", to: "Gare du Nord", duration: "28 min", co2: 45, mode: "Métro" },
  { from: "Boulot", to: "République", duration: "15 min", co2: 0, mode: "Vélo" },
  { from: "Châtelet", to: "La Défense", duration: "22 min", co2: 32, mode: "RER A" },
];

export default function HomePage() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const { stations: velibStations } = useVelibStations(50);
  const { modes: apiModes, loading: modesLoading } = useTransportModes();
  const { linesByMode, loading: linesByModeLoading } = useLinesByMode();

  // ─── Geolocation for nearby Vélib' (F4) ────────────────────────────
  const [userPosition, setUserPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Activez la localisation pour voir les Vélib' proches"
            : "Impossible de déterminer votre position"
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Auto-request location on mount
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const { stations: nearbyVelib, loading: nearbyLoading, error: nearbyError } = useNearbyVelib(
    userPosition?.lat ?? null,
    userPosition?.lon ?? null,
    2,
    8
  );

  // Build display modes: API modes + Vélib' (not in PRIM lines data)
  // Order: Métro, RER, Tram, Bus, Vélib', Transilien
  const displayModes: TransportMode[] = modesLoading
    ? fallbackModes
    : (() => {
        const ordered: TransportMode[] = [];
        const modeMap = Object.fromEntries(apiModes.map(m => [m.key, m]));
        // Insert in desired order
        for (const key of ['metro', 'rer', 'tram', 'bus']) {
          if (modeMap[key]) ordered.push(modeMap[key]);
        }
        ordered.push(velibMode);
        if (modeMap['transilien']) ordered.push(modeMap['transilien']);
        return ordered;
      })();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-[var(--color-primary)] text-white px-4 h-[60px] flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-2">
          <MapPin size={22} className="text-white" />
          <h1 className="text-lg font-semibold">UrbanFlow</h1>
        </div>
        <button
          className="text-sm text-white/80 hover:text-white transition-colors"
          aria-label="Notifications"
        >
          <Navigation size={20} />
        </button>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 px-4 py-4 pb-[96px] max-w-lg mx-auto w-full">
        {/* Search Bar */}
        <div className="mb-6">
          <SearchBar
            placeholder="Où allez-vous ?"
            value={searchValue}
            onChange={setSearchValue}
            onSubmit={() => router.push("/search")}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => router.push("/search")}
              className="flex-1 h-[44px] rounded-[var(--chip-radius)] bg-[var(--color-primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              <MapPin size={16} />
              Itinéraire
            </button>
            <button
              onClick={() => router.push("/search?mode=velib")}
              className="flex-1 h-[44px] rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#6DA33A] transition-colors"
            >
              <Bike size={16} />
              Vélib&apos; proches
            </button>
          </div>
        </div>

        {/* Transport Modes */}
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
          Modes de transport
        </h2>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {displayModes.map((mode) => (
            <TransportCard
              key={mode.key}
              icon={mode.emoji}
              label={mode.label}
              color={mode.color}
              subtitle={mode.key === "velib" ? `${mode.count.toLocaleString("fr-FR")} stations` : mode.key === "bus" ? `${mode.count.toLocaleString("fr-FR")} lignes` : `${mode.activeCount} lignes`}
              statusBadge={mode.key !== "velib" && !modesLoading ? "normal" : undefined}
              topLines={mode.lines.slice(0, 4)}
              onClick={() => router.push(`/search?mode=${mode.key}`)}
            />
          ))}
        </div>

        {/* Live Lines */}
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
          Lignes en temps réel
        </h2>
        <LinesByModeSection linesByMode={linesByMode} loading={linesByModeLoading} />

        {/* Nearby Vélib' (F4) */}
        <NearbyVelibSection
          stations={nearbyVelib}
          loading={nearbyLoading && userPosition !== null}
          error={geoError || nearbyError}
          onRequestLocation={requestLocation}
        />

        {/* Map */}
        <div className="rounded-[var(--card-radius)] h-44 mb-6 border border-[var(--color-border)] overflow-hidden">
          <DynamicMap
            center={userPosition ? [userPosition.lat, userPosition.lon] : [48.8566, 2.3522]}
            zoom={userPosition ? 15 : 13}
            showVelib
            velibStations={nearbyVelib.length > 0
              ? nearbyVelib.map((s) => ({
                  position: s.position,
                  name: s.name,
                  available_bikes: s.available_bikes,
                  available_bike_stands: s.available_bike_stands,
                }))
              : velibStations.map((s) => ({
                  position: s.position,
                  name: s.name,
                  available_bikes: s.available_bikes,
                  available_bike_stands: s.available_bike_stands,
                }))
            }
            userPosition={userPosition ? { lat: userPosition.lat, lon: userPosition.lon } : null}
            onLocateUser={requestLocation}
          />
        </div>

        {/* Recent Trips */}
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
          Trajets récents
        </h2>
        <div className="space-y-2">
          {recentTrips.map((trip, i) => (
            <button
              key={i}
              onClick={() => router.push(`/search?mode=${trip.mode.toLowerCase().replace("'", "").replace(" ", "")}`)}
              className="w-full flex items-center gap-3 bg-white rounded-[var(--card-radius)] p-3 border border-[var(--color-border)] hover:shadow-sm transition-all text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {trip.from} → {trip.to}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1">
                    <Clock size={11} />
                    {trip.duration}
                  </span>
                  <CO2Badge grams={trip.co2} />
                </div>
              </div>
              <ChevronRight size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
            </button>
          ))}
        </div>
      </main>

      {/* ─── Nav Bar ─── */}
      <NavBar />
    </div>
  );
}
