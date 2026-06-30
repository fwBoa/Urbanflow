"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useGeolocation } from "./useGeolocation";
import type { JourneySegment } from "@/services/api";
import { Immersion, stopSpeaking, haptic as _haptic } from "@/services/immersion";

// ─── Types ──────────────────────────────────────────────────────────
export interface NavigationState {
  /** Index du segment actif (0-based) */
  activeSegment: number;
  /** Distance restante estimée en mètres */
  remainingDistance: number;
  /** Temps restant estimé en minutes */
  remainingTime: number;
  /** Vitesse actuelle en km/h (depuis le GPS) */
  currentSpeed: number;
  /** Direction du prochain virage (bearing) */
  nextBearing: number | null;
  /** Progression globale (0-100) */
  progress: number;
  /** L'utilisateur est-il arrivé ? */
  arrived: boolean;
  /** L'utilisateur s'est-il écarté du trajet ? */
  offRoute: boolean;
  /** Position actuelle de l'utilisateur */
  userPosition: { lat: number; lon: number } | null;
}

export interface NavigationInstruction {
  /** Instruction textuelle (ex: "Tournez à droite sur Rue de Rivoli") */
  text: string;
  /** Icône de direction */
  icon: "straight" | "left" | "right" | "slight-left" | "slight-right" | "arrive" | "depart";
  /** Distance jusqu'à la prochaine instruction en mètres */
  distanceToNext: number;
  /** Temps estimé jusqu'à la prochaine instruction en minutes */
  timeToNext: number;
}

const OFF_ROUTE_THRESHOLD_M = 50; // Distance en mètres pour considérer hors trajet
const ARRIVAL_THRESHOLD_M = 30; // Distance en mètres pour considérer arrivé à un point

// ─── Haversine distance ─────────────────────────────────────────────
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000; // Rayon de la Terre en mètres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Bearing entre deux points ────────────────────────────────────────
function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ─── Point le plus proche sur une polyline ────────────────────────────
function closestPointOnSegment(
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): { lat: number; lon: number; distance: number; progress: number } {
  // Projection du point P sur le segment AB
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return { lat: a.lat, lon: a.lon, distance: haversineDistance(p.lat, p.lon, a.lat, a.lon), progress: 0 };
  }
  let t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { lat: a.lat + t * dy, lon: a.lon + t * dx };
  return {
    lat: proj.lat,
    lon: proj.lon,
    distance: haversineDistance(p.lat, p.lon, proj.lat, proj.lon),
    progress: t,
  };
}

/**
 * Hook de navigation GPS temps réel.
 * Suit la position de l'utilisateur, calcule la progression sur le trajet,
 * détecte les écarts de route, et fournit les instructions de direction.
 */
export function useNavigation(
  segments: JourneySegment[],
  routePoints: [number, number][], // [lat, lon][]
  origin: { lat: number; lon: number } | null,
  destination: { lat: number; lon: number } | null,
) {
  const { lat, lon, accuracy, heading, speed, startWatch, stopWatch, watching } = useGeolocation();
  const [activeSegment, setActiveSegment] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastSpokenRef = useRef<number>(-1);

  // ─── Démarrer/Arrêter la navigation ────────────────────────────────
  const startNavigation = useCallback(() => {
    setIsNavigating(true);
    setIsPaused(false);
    setActiveSegment(0);
    setElapsedSeconds(0);
    setArrived(false);
    setOffRoute(false);
    lastSpokenRef.current = -1;
    startWatch(); // Activer le GPS continu
  }, [startWatch]);

  const pauseNavigation = useCallback(() => setIsPaused(true), []);
  const resumeNavigation = useCallback(() => setIsPaused(false), []);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setIsPaused(false);
    setElapsedSeconds(0);
    setActiveSegment(0);
    setArrived(false);
    setOffRoute(false);
    lastSpokenRef.current = -1;
    stopWatch(); // Désactiver le GPS
    if (timerRef.current) clearInterval(timerRef.current);
    // Stop voice & haptic
    stopSpeaking();
    _haptic(0); // cancel ongoing vibration
    // Release wake lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, [stopWatch]);

  // ─── Timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNavigating && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isNavigating, isPaused]);

  // ─── Screen Wake Lock ──────────────────────────────────────────────
  useEffect(() => {
    if (!isNavigating) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };
    if (nav.wakeLock && typeof nav.wakeLock.request === "function") {
      nav.wakeLock.request("screen")
        .then((lock: WakeLockSentinel) => {
          wakeLockRef.current = lock;
        })
        .catch(() => {
          // Ignore — wake lock is a nice-to-have
        });
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isNavigating]);

  // ─── Calcul de la progression GPS ──────────────────────────────────
  const navState = useMemo<NavigationState>(() => {
    const userPos = lat && lon ? { lat, lon } : null;

    if (!userPos || !origin || !destination || routePoints.length < 2) {
      return {
        activeSegment,
        remainingDistance: 0,
        remainingTime: 0,
        currentSpeed: 0,
        nextBearing: null,
        progress: 0,
        arrived: false,
        offRoute: false,
        userPosition: userPos,
      };
    }

    // Distance totale du trajet
    let totalRouteDistance = 0;
    for (let i = 1; i < routePoints.length; i++) {
      totalRouteDistance += haversineDistance(
        routePoints[i - 1][0], routePoints[i - 1][1],
        routePoints[i][0], routePoints[i][1],
      );
    }

    // Trouver le point le plus proche sur la route
    let minDist = Infinity;
    let closestIdx = 0;
    let closestProgress = 0;

    for (let i = 0; i < routePoints.length - 1; i++) {
      const cp = closestPointOnSegment(
        userPos,
        { lat: routePoints[i][0], lon: routePoints[i][1] },
        { lat: routePoints[i + 1][0], lon: routePoints[i + 1][1] },
      );
      if (cp.distance < minDist) {
        minDist = cp.distance;
        closestIdx = i;
        closestProgress = cp.progress;
      }
    }

    // Distance parcourue (du début jusqu'au point le plus proche)
    let traveledDistance = 0;
    for (let i = 1; i <= closestIdx; i++) {
      traveledDistance += haversineDistance(
        routePoints[i - 1][0], routePoints[i - 1][1],
        routePoints[i][0], routePoints[i][1],
      );
    }
    // Ajouter la portion du segment courant
    if (closestIdx < routePoints.length - 1) {
      traveledDistance += closestProgress * haversineDistance(
        routePoints[closestIdx][0], routePoints[closestIdx][1],
        routePoints[closestIdx + 1][0], routePoints[closestIdx + 1][1],
      );
    }

    const remainingDistance = Math.max(0, totalRouteDistance - traveledDistance);
    const progress = totalRouteDistance > 0 ? (traveledDistance / totalRouteDistance) * 100 : 0;

    // Vitesse actuelle (km/h → m/s)
    const currentSpeed = speed ? speed * 3.6 : 0; // speed est en m/s depuis le GPS

    // Temps restant estimé (basé sur la vitesse GPS ou une vitesse de marche par défaut)
    const avgSpeedMs = speed && speed > 0.5 ? speed : 1.4; // 1.4 m/s = 5 km/h marche par défaut
    const remainingTime = remainingDistance / avgSpeedMs / 60; // en minutes

    // Bearing vers le prochain point de la route
    const nextIdx = Math.min(closestIdx + 1, routePoints.length - 1);
    const nextBearing = bearing(
      userPos.lat, userPos.lon,
      routePoints[nextIdx][0], routePoints[nextIdx][1],
    );

    // ─── Segment actif basé sur la progression GPS ────────────────────
    const totalDuration = segments.reduce((acc, s) => acc + s.durationMinutes, 0);
    const progressRatio = totalDuration > 0 ? traveledDistance / totalRouteDistance : 0;
    let segIdx = 0;
    let cumDuration = 0;
    for (let i = 0; i < segments.length; i++) {
      cumDuration += segments[i].durationMinutes;
      if ((cumDuration / totalDuration) >= progressRatio) {
        segIdx = i;
        break;
      }
      segIdx = i;
    }

    // Vérifier si arrivé à destination
    const distToDest = haversineDistance(userPos.lat, userPos.lon, destination.lat, destination.lon);
    const isArrived = distToDest < ARRIVAL_THRESHOLD_M;

    // Vérifier si hors route
    const isOffRoute = minDist > OFF_ROUTE_THRESHOLD_M;

    return {
      activeSegment: segIdx,
      remainingDistance: Math.round(remainingDistance),
      remainingTime: Math.round(remainingTime * 10) / 10,
      currentSpeed: Math.round(currentSpeed * 10) / 10,
      nextBearing,
      progress: Math.min(progress, 100),
      arrived: isArrived,
      offRoute: isOffRoute,
      userPosition: userPos,
    };
  }, [lat, lon, speed, routePoints, origin, destination, segments, activeSegment]);

  // ─── Mettre à jour le segment actif et l'état arrivé ──────────────
  useEffect(() => {
    if (isNavigating && !isPaused) {
      setActiveSegment(navState.activeSegment);
      setArrived(navState.arrived);
      setOffRoute(navState.offRoute);
    }
  }, [isNavigating, isPaused, navState.activeSegment, navState.arrived, navState.offRoute]);

  // ─── Vibration + Annonce vocale à chaque changement d'étape ────────
  useEffect(() => {
    if (!isNavigating || isPaused) return;
    if (activeSegment !== lastSpokenRef.current && segments[activeSegment]) {
      lastSpokenRef.current = activeSegment;
      const seg = segments[activeSegment];
      const text =
        seg.type === "walking"
          ? `Étape ${activeSegment + 1} : ${seg.instruction}`
          : `Montez dans le ${seg.mode || "transit"} direction ${seg.direction || seg.toStop || ""}`;
      Immersion.segmentChange(text);
    }
  }, [activeSegment, isNavigating, isPaused, segments]);

  // ─── Annonce arrivée ─────────────────────────────────────────────
  useEffect(() => {
    if (arrived && isNavigating) {
      Immersion.arrived();
    }
  }, [arrived, isNavigating]);

  // ─── Alerte hors trajet ──────────────────────────────────────────
  useEffect(() => {
    if (offRoute && isNavigating) {
      Immersion.offRoute();
    }
  }, [offRoute, isNavigating]);

  // ─── Instruction de direction ──────────────────────────────────────
  const instruction = useMemo<NavigationInstruction>(() => {
    const seg = segments[navState.activeSegment];
    if (!seg) {
      return {
        text: "Calcul en cours…",
        icon: "depart",
        distanceToNext: 0,
        timeToNext: 0,
      };
    }

    // Déterminer l'icône de direction
    let icon: NavigationInstruction["icon"] = "straight";
    if (navState.activeSegment === 0) {
      icon = "depart";
    } else if (navState.activeSegment === segments.length - 1) {
      icon = "arrive";
    } else if (seg.type === "walking") {
      icon = "straight";
    } else {
      icon = "straight";
    }

    return {
      text: seg.instruction,
      icon,
      distanceToNext: navState.remainingDistance,
      timeToNext: navState.remainingTime,
    };
  }, [segments, navState.activeSegment, navState.remainingDistance, navState.remainingTime]);

  // ─── Arrêt automatique si arrivé ────────────────────────────────────
  useEffect(() => {
    if (arrived && isNavigating) {
      // On ne stoppe pas automatiquement, on laisse l'utilisateur confirmer
    }
  }, [arrived, isNavigating]);

  return {
    // État de navigation
    isNavigating,
    isPaused,
    activeSegment: navState.activeSegment,
    elapsedSeconds,
    progress: navState.progress,
    arrived: navState.arrived,
    offRoute: navState.offRoute,

    // Données GPS
    userPosition: navState.userPosition,
    currentSpeed: navState.currentSpeed,
    remainingDistance: navState.remainingDistance,
    remainingTime: navState.remainingTime,
    nextBearing: navState.nextBearing,

    // Instruction de direction
    instruction,

    // Contrôles
    startNavigation,
    pauseNavigation,
    resumeNavigation,
    stopNavigation,

    // GPS brut
    accuracy,
    heading,
  };
}
