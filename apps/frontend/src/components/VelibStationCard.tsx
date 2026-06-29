"use client";

import { Bike, Locate, Zap } from "lucide-react";
import type { NearbyVelibStation, NearbyScooter } from "@/hooks/useTransport";

// ─── Vélib' Station Card ──────────────────────────────────────────────
export function VelibStationCard({ station }: { station: NearbyVelibStation }) {
  const distText =
    station.distance < 1000
      ? `${station.distance} m`
      : `${(station.distance / 1000).toFixed(1)} km`;

  return (
    <div className="flex items-center gap-3 bg-white rounded-[var(--card-radius)] p-3 border border-[var(--color-border)] hover:shadow-sm transition-all">
      {/* Distance badge */}
      <div className="flex flex-col items-center min-w-[48px]">
        <span className="text-[13px] font-bold text-[var(--color-primary)]">{distText}</span>
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          {station.arrondissement}
        </span>
      </div>

      {/* Station name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {station.name}
        </p>
      </div>
    </div>
  );
}

// ─── Nearby Vélib' Section ────────────────────────────────────────────
export function NearbyVelibSection({ stations, loading, error, onRequestLocation }: {
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

// ─── Trottinette / Vélo partagé Card ──────────────────────────────────
function ScooterCard({ vehicle }: { vehicle: NearbyScooter }) {
  const distText =
    vehicle.distance < 1000
      ? `${vehicle.distance} m`
      : `${(vehicle.distance / 1000).toFixed(1)} km`;
  const typeLabel = vehicle.type === "trottinette" ? "Trottinette" : "Vélo";

  return (
    <div className="flex items-center gap-3 bg-white rounded-[var(--card-radius)] p-3 border border-[var(--color-border)] hover:shadow-sm transition-all">
      <div className="flex flex-col items-center min-w-[48px]">
        <span className="text-[13px] font-bold text-[var(--color-primary)]">{distText}</span>
        <span className="text-[10px] text-[var(--color-text-tertiary)] capitalize">
          {vehicle.operator}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {typeLabel} {vehicle.battery !== undefined ? `· ${vehicle.battery}%` : ""}
        </p>
      </div>
      {vehicle.battery !== undefined && (
        <Zap size={14} className="text-[var(--color-text-tertiary)] shrink-0" />
      )}
    </div>
  );
}

// ─── Nearby Scooters Section (GBFS free-floating) ──────────────────────
export function NearbyScootersSection({
  vehicles,
  message,
  loading,
  error,
  onRequestLocation,
}: {
  vehicles: NearbyScooter[];
  message?: string;
  loading: boolean;
  error: string | null;
  onRequestLocation: () => void;
}) {
  if (loading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Trottinettes &amp; vélos partagés
          </h2>
          <span className="text-[11px] text-[var(--color-text-tertiary)] animate-pulse">
            Recherche…
          </span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-[var(--color-border)] rounded-[var(--card-radius)] h-14" />
          ))}
        </div>
      </div>
    );
  }

  if (error && vehicles.length === 0) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Trottinettes &amp; vélos partagés
          </h2>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{error}</p>
          <button
            onClick={onRequestLocation}
            className="px-4 py-2 rounded-[var(--chip-radius)] bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-colors"
          >
            <Locate size={14} className="inline mr-1" />
            Activer la localisation
          </button>
        </div>
      </div>
    );
  }

  if (vehicles.length === 0) {
    // À Paris : free-floating interdit depuis 2023 (message renvoyé par le backend).
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Trottinettes &amp; vélos partagés
          </h2>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {message || "Aucun véhicule partagé trouvé à proximité."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={18} className="text-[var(--color-primary)]" />
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Trottinettes &amp; vélos partagés
        </h2>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {vehicles.length} véhicule{vehicles.length > 1 ? "s" : ""} · 2 km
        </span>
      </div>
      <div className="space-y-2">
        {vehicles.map((vehicle) => (
          <ScooterCard key={vehicle.id} vehicle={vehicle} />
        ))}
      </div>
    </div>
  );
}