"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Bike, Clock, ChevronRight, CheckCircle, AlertCircle } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import NavBar from "@/components/NavBar";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
import { NearbyVelibSection } from "@/components/VelibStationCard";
import { useVelibStations, useLinesByMode, useNearbyVelib } from "@/hooks/useTransport";
import type { LineByMode, LinesByMode } from "@/hooks/useTransport";
import { getHistory } from "@/services/favorites";
import type { HistoryJourney } from "@/services/favorites";

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
              aria-pressed={isActive}
              aria-label={`${tab.label} — ${count} ligne${count > 1 ? 's' : ''}`}
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

export default function HomePage() {
  const router = useRouter();
  const [recentTrips, setRecentTrips] = useState<HistoryJourney[]>([]);
  const { stations: velibStations } = useVelibStations(50);
  const { linesByMode, loading: linesByModeLoading } = useLinesByMode();

  // ─── Load recent trips from history ────────────────────────────────
  useEffect(() => {
    getHistory().then((history) => {
      // Take the 3 most recent
      setRecentTrips(history.slice(0, 3));
    });
  }, []);

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
    // requestLocation updates internal state; this is the intended initialization path.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    requestLocation();
  }, [requestLocation]);

  const { stations: nearbyVelib, loading: nearbyLoading, error: nearbyError } = useNearbyVelib(
    userPosition?.lat ?? null,
    userPosition?.lon ?? null,
    2,
    8
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* WCAG 2.4.1: Skip navigation link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:bg-background focus:text-[var(--color-text-primary)] focus:p-4 focus:outline focus:outline-2 focus:outline-[var(--color-primary)]"
      >
        Aller au contenu principal
      </a>
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-[var(--color-border)]/60 text-[var(--color-text-primary)] px-4 h-[60px] flex items-center justify-between safe-area-top transition-colors duration-300">
        <div className="flex items-center gap-2">
          <MapPin size={22} className="text-[var(--color-primary)]" />
          <h1 className="text-base font-semibold">UrbanFlow</h1>
        </div>
        <NotificationBell />
      </header>

      {/* ─── Main Content ─── */}
      <main id="main-content" className="flex-1 px-4 py-4 pb-[96px] max-w-lg mx-auto w-full">
        {/* ─── CTAs : entrées principales (itinéraire / Vélib') ─── */}
        <div className="mb-6 flex gap-2">
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
          {recentTrips.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] py-2">
              Aucun trajet récent. Lancez une recherche pour voir vos trajets ici.
            </p>
          ) : (
            recentTrips.map((trip, i) => (
              <button
                key={trip.id || i}
                onClick={() => router.push(`/search?mode=${trip.mode.toLowerCase().replace("'", "").replace(/\s+/g, "")}`)}
                className="w-full flex items-center gap-3 bg-surface rounded-[var(--card-radius)] p-3 border border-[var(--color-border)] hover:shadow-md transition-all text-left"
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
                    {trip.modeColor && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: trip.modeColor }}
                      >
                        {trip.mode}
                      </span>
                    )}
                    <CO2Badge grams={trip.co2} />
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
              </button>
            ))
          )}
        </div>
      </main>

      {/* ─── Nav Bar ─── */}
      <NavBar />
    </div>
  );
}
