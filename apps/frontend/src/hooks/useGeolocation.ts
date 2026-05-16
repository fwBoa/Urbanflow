"use client";

import { useState, useEffect, useCallback } from "react";

export interface GeolocationState {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  permission: "granted" | "denied" | "prompt" | "unknown";
}

/**
 * Hook pour accéder à la géolocalisation du navigateur.
 * Demande la permission à l'utilisateur au premier appel.
 *
 * Usage:
 *   const { lat, lon, loading, error, permission } = useGeolocation();
 *   const locate = useLocate(); // force une nouvelle lecture
 */
export function useGeolocation(): GeolocationState & { locate: () => void } {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lon: null,
    accuracy: null,
    loading: false,
    error: null,
    permission: "unknown",
  });

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        error: "La géolocalisation n'est pas supportée par ce navigateur.",
        permission: "denied",
      }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
          permission: "granted",
        });
      },
      (err) => {
        let message = "Impossible d'obtenir la position.";
        if (err.code === err.PERMISSION_DENIED) {
          message = "Permission de géolocalisation refusée.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          message = "Position indisponible.";
        } else if (err.code === err.TIMEOUT) {
          message = "Délai de géolocalisation dépassé.";
        }
        setState((s) => ({
          ...s,
          loading: false,
          error: message,
          permission: err.code === err.PERMISSION_DENIED ? "denied" : "prompt",
        }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Auto-locate on mount (soft — don't force prompt immediately)
  useEffect(() => {
    // Only auto-locate if permission was previously granted
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (result.state === "granted") {
            locate();
          }
          setState((s) => ({ ...s, permission: result.state as any }));
        })
        .catch(() => {
          // permissions API not supported, stay unknown
        });
    }
  }, [locate]);

  return { ...state, locate };
}
