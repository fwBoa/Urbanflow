"use client";

import { useState, useEffect } from "react";

const getInitialReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hook qui détecte si l'utilisateur a demandé une réduction des animations
 * (prefers-reduced-motion). Écoute les changements de préférence système.
 *
 * Retourne également `true` si `window.matchMedia` n'est pas disponible
 * (SSR / environnement restreint) pour privilégier la sobriété par défaut.
 */
export function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(getInitialReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);

    update();

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    // Legacy Safari
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return reducedMotion;
}
