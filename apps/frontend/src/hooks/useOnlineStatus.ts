"use client";

import { useSyncExternalStore } from "react";

/**
 * État réseau de l'appareil, exposé via useSyncExternalStore (zéro mismatch
 * SSR : le snapshot initial est identique serveur/client puis corrigé par
 * le navigateur). Source unique de vérité pour tous les comportements
 * hors-ligne de l'app — ne pas multiplier les addEventListener("online").
 *
 * Déclenchement du mode hors-ligne :
 * - l'événement `offline` du navigateur (perte réseau : wifi coupé, avion…)
 * - l'événement `online` au retour
 * Ces événements reflètent navigator.onLine : c'est une signalétique
 * interface (l'interface réseau est active ou non), pas un ping. Une
 * connexion captive ou un réseau mort peut donc indiquer "online" tout en
 * laissant les appels échouer — les hooks de données gèrent ce cas par
 * leur propre fallback cache (voir services/offlineDb.ts).
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// SSR : toujours "online" au premier rendu serveur (le navigateur corrige
// dès l'hydratation via les événements).
function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}