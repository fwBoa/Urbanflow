"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { CloudOff } from "lucide-react";

/**
 * Bandeau permanent affiché quand l'appareil perd le réseau.
 *
 * Déclenchement : événement `offline` du navigateur via useOnlineStatus.
 * Le mode hors-ligne repose sur 3 couches complémentaires :
 * 1. Ce bandeau : informe l'utilisateur de l'état (interface seulement).
 * 2. Le Service Worker (public/sw.js) : sert les pages déjà visitées
 *    depuis le cache (stratégie network-first + fallback cache) et la
 *    page /offline pour les navigations jamais vues.
 * 3. IndexedDB (services/offlineDb.ts) : données métier mises en cache
 *    (arrêts à proximité) lisibles sans réseau, servies cache-first par
 *    les hooks de données.
 *
 * Ce composant n'affiche rien quand la connexion est revenue (rendu null).
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 text-xs font-medium"
    >
      <CloudOff size={14} className="shrink-0" />
      Hors ligne — dernières données affichées, certaines fonctionnalités sont indisponibles
    </div>
  );
}