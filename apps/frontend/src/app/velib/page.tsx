"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import DynamicMap from "@/components/DynamicMap";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";
import { VelibStationCard } from "@/components/VelibStationCard";
import { useNearbyVelib } from "@/hooks/useTransport";

export default function VelibPage() {
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
            : "Impossible de déterminer votre position",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    // Initialise la localisation au montage ; setState dans une callback
    // geolocation asynchrone (API externe) donc acceptable ici.
    /* eslint-disable react-hooks/set-state-in-effect */
    requestLocation();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [requestLocation]);

  const { stations, loading, error } = useNearbyVelib(
    userPosition?.lat ?? null,
    userPosition?.lon ?? null,
    2,
    15,
  );

  const mapStations = stations.map((s) => ({
    position: s.position,
    name: s.name,
    available_bikes: s.available_bikes,
    available_bike_stands: s.available_bike_stands,
  }));

  return (
    <AppShell title="Vélib' proches" showBack>
      <div className="space-y-4">
        {/* Map full width */}
        <div className="rounded-[var(--card-radius)] h-64 border border-[var(--color-border)] overflow-hidden">
          <DynamicMap
            center={userPosition ? [userPosition.lat, userPosition.lon] : [48.8566, 2.3522]}
            zoom={userPosition ? 15 : 13}
            showVelib
            velibStations={mapStations}
            userPosition={userPosition ? { lat: userPosition.lat, lon: userPosition.lon } : null}
            onLocateUser={requestLocation}
          />
        </div>

        {/* Header + locate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UrbanFlowIcon type="transport" name="bike" size={18} className="text-[var(--color-eco-green)]" />
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Stations proches
            </h2>
          </div>
          <button
            type="button"
            onClick={requestLocation}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--color-eco-green)] text-white text-xs font-medium hover:bg-[#6DA33A] transition-colors"
          >
            <UrbanFlowIcon type="action" name="locate" size={14} />
            Actualiser
          </button>
        </div>

        {(loading && !geoError) && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-[var(--color-eco-green)] mr-2" size={20} />
            <span className="text-sm text-[var(--color-text-secondary)]">Chargement des stations…</span>
          </div>
        )}

        {(geoError || error) && stations.length === 0 && (
          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
            <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{geoError || error}</p>
            <button
              type="button"
              onClick={requestLocation}
              className="px-4 py-2 rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-medium hover:bg-[#6DA33A] transition-colors"
            >
              <UrbanFlowIcon type="action" name="locate" size={14} className="inline mr-1" />
              Activer la localisation
            </button>
          </div>
        )}

        {!loading && !geoError && stations.length === 0 && (
          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
            <p className="text-sm text-[var(--color-text-tertiary)]">
              Aucune station Vélib&apos; trouvée à proximité.
            </p>
          </div>
        )}

        {stations.length > 0 && (
          <div className="space-y-2">
            {stations.map((station) => (
              <VelibStationCard key={station.id} station={station} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
