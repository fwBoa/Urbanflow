"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { hasGeolocConsent } from "@/components/ConsentBanner";

export interface GeolocationState {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  heading: number | null;      // Direction en degrés (0-360)
  speed: number | null;         // Vitesse en m/s
  loading: boolean;
  error: string | null;
  permission: "granted" | "denied" | "prompt" | "unknown";
  watching: boolean;            // watchPosition actif ?
}

/**
 * Hook pour accéder à la géolocalisation du navigateur.
 * Supporte getCurrentPosition (ponctuel) et watchPosition (suivi continu).
 *
 * Usage:
 *   const { lat, lon, loading, error, watching, locate, startWatch, stopWatch } = useGeolocation();
 */
export function useGeolocation(): GeolocationState & {
  locate: () => void;
  startWatch: () => void;
  stopWatch: () => void;
} {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lon: null,
    accuracy: null,
    heading: null,
    speed: null,
    loading: false,
    error: null,
    permission: "unknown",
    watching: false,
  });

  const watchIdRef = useRef<number | null>(null);

  // ─── Position ponctuelle (getCurrentPosition) ──────────────────────
  const locate = useCallback(() => {
    // ─── RGPD: Vérifier le consentement géolocalisation avant activation ───
    if (!hasGeolocConsent()) {
      setState((s) => ({
        ...s,
        error: "Consentement requis pour la géolocalisation. Activez-la dans les paramètres.",
        permission: "prompt",
      }));
      return;
    }

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
          heading: position.coords.heading,
          speed: position.coords.speed,
          loading: false,
          error: null,
          permission: "granted",
          watching: false,
        });
      },
      (err) => {
        let message = "Impossible d'obtenir la position.";
        if (err.code === err.PERMISSION_DENIED) message = "Permission de géolocalisation refusée.";
        else if (err.code === err.POSITION_UNAVAILABLE) message = "Position indisponible.";
        else if (err.code === err.TIMEOUT) message = "Délai de géolocalisation dépassé.";
        setState((s) => ({
          ...s,
          loading: false,
          error: message,
          permission: err.code === err.PERMISSION_DENIED ? "denied" : "prompt",
        }));
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }, []);

  // ─── Suivi continu (watchPosition) ─────────────────────────────────
  const startWatch = useCallback(() => {
    // ─── RGPD: Vérifier le consentement géolocalisation avant activation ───
    if (!hasGeolocConsent()) {
      setState((s) => ({
        ...s,
        error: "Consentement requis pour la géolocalisation. Activez-la dans les paramètres.",
        permission: "prompt",
      }));
      return;
    }

    if (!navigator.geolocation) return;

    // Arrêter un watch existant
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setState((s) => ({ ...s, loading: true, error: null, watching: true }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setState({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          loading: false,
          error: null,
          permission: "granted",
          watching: true,
        });
      },
      (err) => {
        let message = "Suivi GPS interrompu.";
        if (err.code === err.PERMISSION_DENIED) message = "Permission de géolocalisation refusée.";
        setState((s) => ({
          ...s,
          loading: false,
          error: message,
          watching: false,
          permission: err.code === err.PERMISSION_DENIED ? "denied" : s.permission,
        }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, watching: false }));
  }, []);

  // ─── Auto-locate si permission déjà accordée ET consentement RGPD ───
  useEffect(() => {
    // ─── RGPD: Ne pas auto-localiser sans consentement explicite ───
    if (!hasGeolocConsent()) return;

    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (result.state === "granted") {
            locate();
          }
          setState((s) => ({ ...s, permission: result.state }));
        })
        .catch(() => {});
    }
  }, [locate]);

  // ─── Nettoyage au démontage ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { ...state, locate, startWatch, stopWatch };
}
