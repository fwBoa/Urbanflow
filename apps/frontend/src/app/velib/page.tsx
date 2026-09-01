"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import DynamicMap from "@/components/DynamicMap";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";
import { VelibStationCard } from "@/components/VelibStationCard";
import { useNearbyVelib } from "@/hooks/useTransport";

// ─── Centre de Paris (fallback sans géolocalisation) ───────────────────
// Kaizen C3a : sans position, on affiche quand même des stations (autour
// de Notre-Dame) plutôt qu'un écran vide — avec bannière d'explication.
const PARIS_CENTER = { lat: 48.8566, lon: 2.3522 };

/**
 * Guide de déblocage de la géolocalisation selon le navigateur.
 * PERMISSION_DENIED ne se débloque PAS en re-cliquant le bouton : il faut
 * intervenir dans les réglages du navigateur. On le dit explicitement.
 */
function geolocHelpMessage(): string {
  const ua = navigator.userAgent;
  if (/Firefox/.test(ua)) {
    return "Firefox : cliquez sur le cadenas dans la barre d'adresse, puis autorisez « Accéder à votre localisation » et rechargez la page.";
  }
  if (/Edg\//.test(ua)) {
    return "Edge : cliquez sur l'icône de localisation dans la barre d'adresse (ou Paramètres du site → Autorisations → Position) et rechargez la page.";
  }
  if (/Chrome/.test(ua) && !/Edg|OPR/.test(ua)) {
    return "Chrome : cliquez sur l'icône à gauche de l'URL → Autorisations du site → Position → Autoriser, puis rechargez la page.";
  }
  if (/Safari/.test(ua)) {
    return "Safari : Réglages > Sites Web > Localisation > urbanflow-mobility.fr > Autoriser, puis rechargez la page.";
  }
  return "Autorisez la localisation dans les réglages de votre navigateur, puis rechargez la page.";
}

export default function VelibPage() {
  const [userPosition, setUserPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Prompt de permission OS en cours : on n'affiche ni "aucune station"
  // ni erreur tant que l'utilisateur n'a pas répondu.
  const [geoPending, setGeoPending] = useState(true);
  const [geoDenied, setGeoDenied] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoPending(false);
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }
    setGeoPending(true);
    setGeoError(null);
    setGeoDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoPending(false);
        setGeoDenied(false);
      },
      (err) => {
        setGeoPending(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoDenied(true);
          setGeoError("La localisation est bloquée pour ce site.");
        } else if (err.code === err.TIMEOUT) {
          setGeoError("La géolocalisation a mis trop de temps. Réessayez.");
        } else {
          setGeoError("Impossible de déterminer votre position. Réessayez.");
        }
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

  // ─── Source des stations : position réelle, sinon centre de Paris ────
  // Le hook reste inchangé : on lui passe Notre-Dame en mode dégradé.
  const effectivePosition = userPosition ?? PARIS_CENTER;
  const isFallbackPosition = userPosition === null && !geoPending;

  const { stations, loading, error } = useNearbyVelib(
    effectivePosition.lat,
    effectivePosition.lon,
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
            center={[effectivePosition.lat, effectivePosition.lon]}
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
            disabled={geoPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--color-eco-green)] text-white text-xs font-medium hover:bg-[#6DA33A] transition-colors disabled:opacity-60"
          >
            {geoPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UrbanFlowIcon type="action" name="locate" size={14} />
            )}
            Actualiser
          </button>
        </div>

        {/* Prompt de permission OS en cours : loader, jamais "aucune station" */}
        {geoPending && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-[var(--color-eco-green)] mr-2" size={20} />
            <span className="text-sm text-[var(--color-text-secondary)]">Chargement des stations…</span>
          </div>
        )}

        {/* Permission refusée : guide de déblocage par navigateur + fallback */}
        {geoDenied && (
          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
            <p className="text-sm text-[var(--color-text-secondary)] mb-2">{geoError}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-3">{geolocHelpMessage()}</p>
            <button
              type="button"
              onClick={requestLocation}
              className="px-4 py-2 rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-medium hover:bg-[#6DA33A] transition-colors"
            >
              <UrbanFlowIcon type="action" name="locate" size={14} className="inline mr-1" />
              Réessayer
            </button>
          </div>
        )}

        {/* Erreur géoloc transitoire (timeout / indisponible) : réessayer */}
        {!geoPending && !geoDenied && geoError && (
          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
            <p className="text-sm text-[var(--color-text-tertiary)] mb-3">{geoError}</p>
            <button
              type="button"
              onClick={requestLocation}
              className="px-4 py-2 rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-medium hover:bg-[#6DA33A] transition-colors"
            >
              <UrbanFlowIcon type="action" name="locate" size={14} className="inline mr-1" />
              Réessayer
            </button>
          </div>
        )}

        {/* Bannière ambre : mode dégradé, stations du centre affichées */}
        {isFallbackPosition && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2 dark:bg-amber-900/20 dark:border-amber-800/30 dark:text-amber-300" role="status">
            <UrbanFlowIcon type="status" name="alert" size={14} className="shrink-0" />
            Position indisponible — stations autour du centre de Paris affichées.
          </div>
        )}

        {/* Chargement des stations (position connue ou fallback) */}
        {loading && !geoPending && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-[var(--color-eco-green)] mr-2" size={20} />
            <span className="text-sm text-[var(--color-text-secondary)]">Chargement des stations…</span>
          </div>
        )}

        {/* Erreur API backend : message humain + réessayer */}
        {error && !loading && stations.length === 0 && (
          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 text-center">
            <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
              Stations Vélib&apos; momentanément indisponibles.
            </p>
            <button
              type="button"
              onClick={requestLocation}
              className="px-4 py-2 rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-medium hover:bg-[#6DA33A] transition-colors"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Liste des stations (position réelle ou fallback centre) */}
        {!loading && stations.length > 0 && (
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
