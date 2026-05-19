"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Bike, Navigation, Clock, ChevronRight, CheckCircle } from "lucide-react";
import NavBar from "@/components/NavBar";
import SearchBar from "@/components/SearchBar";
import TransportCard from "@/components/TransportCard";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
import { useLines, useVelibStations, useTransportModes } from "@/hooks/useTransport";
import type { TransportMode } from "@/hooks/useTransport";

// Fallback modes when API is loading or unavailable
const fallbackModes: TransportMode[] = [
  { key: "metro", label: "Métro", emoji: "🚇", color: "#2E7D9B", count: 16, activeCount: 16, lines: [] },
  { key: "bus", label: "Bus", emoji: "🚌", color: "#FF9800", count: 350, activeCount: 350, lines: [] },
  { key: "velo", label: "Vélib'", emoji: "🚲", color: "#7CB342", count: 1400, activeCount: 1400, lines: [] },
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

const recentTrips = [
  { from: "Maison", to: "Gare du Nord", duration: "28 min", co2: 45, mode: "Métro" },
  { from: "Boulot", to: "République", duration: "15 min", co2: 0, mode: "Vélo" },
  { from: "Châtelet", to: "La Défense", duration: "22 min", co2: 32, mode: "RER A" },
];

export default function HomePage() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const { lines, loading: linesLoading } = useLines(6);
  const { stations: velibStations } = useVelibStations(50);
  const { modes: apiModes, loading: modesLoading } = useTransportModes();

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
        <div className="space-y-2 mb-6">
          {linesLoading ? (
            <div className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">
              Chargement des lignes...
            </div>
          ) : lines.length > 0 ? (
            lines.slice(0, 4).map((line) => (
              <div
                key={line.id_line}
                className="flex items-center gap-3 bg-white rounded-[var(--card-radius)] p-3 border border-[var(--color-border)]"
              >
                <span
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: `#${line.colourweb_hexa}` }}
                >
                  {line.shortname_line}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {line.networkname}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">
                    {line.transportmode === "bus" ? "Bus" : line.transportmode === "metro" ? "Métro" : line.transportmode}
                    {line.operatorname && ` · ${line.operatorname}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <CheckCircle size={14} className="text-[var(--color-eco-green)]" />
                  <span className="text-[11px] text-[var(--color-eco-green)]">Normal</span>
                </div>
                <ChevronRight size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
              </div>
            ))
          ) : (
            <div className="text-sm text-[var(--color-text-tertiary)] py-4 text-center">
              Aucune ligne disponible
            </div>
          )}
        </div>

        {/* Map */}
        <div className="rounded-[var(--card-radius)] h-44 mb-6 border border-[var(--color-border)] overflow-hidden">
          <DynamicMap
            center={[48.8566, 2.3522]}
            zoom={13}
            showVelib
            velibStations={velibStations.map((s) => ({
              position: s.position,
              name: s.name,
              available_bikes: s.available_bikes,
              available_bike_stands: s.available_bike_stands,
            }))}
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
