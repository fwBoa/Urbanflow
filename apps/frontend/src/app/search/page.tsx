"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Zap, Leaf, Wallet, MapPin, Navigation, Clock } from "lucide-react";
import AppShell from "@/components/AppShell";
import SearchBar from "@/components/SearchBar";
import FilterChip from "@/components/FilterChip";
import TripCard from "@/components/TripCard";
import DynamicMap from "@/components/DynamicMap";
import { useStopSearch } from "@/hooks/useTransport";

const filters = [
  { key: "fast", label: "Rapide", icon: <Zap size={14} /> },
  { key: "eco", label: "Éco", icon: <Leaf size={14} /> },
  { key: "cheap", label: "Économique", icon: <Wallet size={14} /> },
];

const mockTrips = [
  {
    departure: "Châtelet",
    arrival: "La Défense",
    duration: "22 min",
    transfers: 0,
    co2: 32,
    mode: "RER A",
    modeColor: "#1A5A73",
  },
  {
    departure: "Châtelet",
    arrival: "La Défense",
    duration: "35 min",
    transfers: 1,
    co2: 45,
    mode: "Métro + Bus",
    modeColor: "#2E7D9B",
  },
  {
    departure: "Châtelet",
    arrival: "La Défense",
    duration: "45 min",
    transfers: 0,
    co2: 0,
    mode: "Vélib'",
    modeColor: "#7CB342",
  },
];

export default function SearchPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("fast");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const { stops: originStops } = useStopSearch(origin);
  const { stops: destStops } = useStopSearch(destination);

  // Build map markers from search results
  const mapMarkers = useMemo(() => {
    const markers: Array<{ position: [number, number]; label: string; color: string }> = [];
    if (originStops.length > 0) {
      markers.push({
        position: [originStops[0].arrgeopoint.lat, originStops[0].arrgeopoint.lon],
        label: originStops[0].arrname,
        color: "#2E7D9B",
      });
    }
    if (destStops.length > 0) {
      markers.push({
        position: [destStops[0].arrgeopoint.lat, destStops[0].arrgeopoint.lon],
        label: destStops[0].arrname,
        color: "#E53935",
      });
    }
    return markers;
  }, [originStops, destStops]);

  return (
    <AppShell title="Recherche" showBack>
      {/* Search inputs */}
      <div className="space-y-3 mb-4">
        <SearchBar
          placeholder="D'où partez-vous ?"
          value={origin}
          onChange={setOrigin}
        />
        <SearchBar
          placeholder="Où allez-vous ?"
          value={destination}
          onChange={setDestination}
        />
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
          polyline={mapMarkers.length >= 2 ? [
            mapMarkers[0].position,
            mapMarkers[1].position,
          ] : [
            [48.8606, 2.3456],
            [48.8672, 2.3370],
            [48.8756, 2.3080],
            [48.8832, 2.2710],
            [48.8925, 2.2375],
          ]}
        />
      </div>

      {/* Results */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {mockTrips.length} itinéraires trouvés
        </h2>
        {mockTrips.map((trip, i) => (
          <TripCard
            key={i}
            departure={trip.departure}
            arrival={trip.arrival}
            duration={trip.duration}
            transfers={trip.transfers}
            co2={trip.co2}
            mode={trip.mode}
            modeColor={trip.modeColor}
            onClick={() => router.push(`/trip/${i}`)}
          />
        ))}
      </div>
    </AppShell>
  );
}