"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";

const SPLASH_STORAGE_KEY = "uf:splash:v1";
const SPLASH_MIN_MS = 2_000;

const standaloneSubscribe = (onChange: () => void) => {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

const standaloneGetSnapshot = () =>
  window.matchMedia("(display-mode: standalone)").matches;

const standaloneGetServerSnapshot = () => false;

function wasSplashShown(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SPLASH_STORAGE_KEY) === "shown";
  } catch {
    return false;
  }
}

function markSplashShown(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, "shown");
  } catch {
    // ignore
  }
}

/**
 * Splash screen affichée au premier lancement de la PWA en mode standalone.
 *
 * - Visible uniquement si `display-mode: standalone` (PWA installée).
 - Masquée après SPLASH_MIN_MS pour masquer le premier paint / hydratation.
 * - Persistance via localStorage pour ne pas réafficher aux lancements suivants.
 * - SSR-safe : snapshot serveur à false, donc rien n'est rendu côté serveur.
 */
export default function SplashScreen() {
  const standalone = useSyncExternalStore(
    standaloneSubscribe,
    standaloneGetSnapshot,
    standaloneGetServerSnapshot,
  );
  const [show, setShow] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!standalone || wasSplashShown()) return;

    // L’affichage de la splash screen est une synchronisation initiale avec
    // le mode d’affichage PWA et l’état localStorage ; il ne peut pas être
    // déclenché par un événement externe.
    /* eslint-disable react-hooks/set-state-in-effect */
    setShow(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    markSplashShown();

    const timer = setTimeout(() => {
      setHidden(true);
    }, SPLASH_MIN_MS);

    return () => clearTimeout(timer);
  }, [standalone]);

  if (!show) return null;

  return (
    <div
      aria-hidden={hidden}
      className={`
        fixed inset-0 z-[100] flex flex-col items-center justify-center
        transition-opacity duration-700 ease-out
        ${hidden ? "opacity-0 pointer-events-none" : "opacity-100"}
      `}
      style={{
        backgroundColor: "var(--color-background)",
        color: "var(--color-text-primary)",
      }}
    >
      <div className="flex flex-col items-center gap-6">
        <Image
          src="/assets/urbanflow/brand/urbanflow-pictogramme.svg"
          alt="UrbanFlow"
          width={120}
          height={120}
          priority
          className={`
            animate-splash-logo
            ${hidden ? "scale-95" : "scale-100"}
            transition-transform duration-700 ease-out
          `}
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          UrbanFlow
        </h1>
        <div className="h-1 w-32 rounded-full bg-[var(--color-border)] overflow-hidden">
          <div className="h-full bg-[var(--color-primary)] animate-splash-progress origin-left" />
        </div>
      </div>
    </div>
  );
}
