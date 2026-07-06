"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";

// L'événement `beforeinstallprompt` n'est pas typé dans les lib DOM standards.
// On déclare le sous-ensemble utilisé (prompt() + userChoice) pour éviter `any`.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/**
 * Lit `display-mode: standalone` côté client uniquement. Via
 * `useSyncExternalStore` avec un snapshot serveur à `false`, on évite la
 * mismatch d'hydratation (SSR rend `null`, premier render client aussi) SANS
 * déclencher la règle `react-hooks/set-state-in-effect`.
 */
const standaloneSubscribe = (onChange: () => void) => {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};
const standaloneGetSnapshot = () =>
  window.matchMedia("(display-mode: standalone)").matches;
const standaloneGetServerSnapshot = () => false;

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const standalone = useSyncExternalStore(
    standaloneSubscribe,
    standaloneGetSnapshot,
    standaloneGetServerSnapshot,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDismissed(true);
    }
    setDeferredPrompt(null);
  };

  // Masqué : déjà installé en mode standalone, ou fermé par l'utilisateur.
  const visible = !standalone && !dismissed;
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--color-primary)] text-white p-4 rounded-xl shadow-lg z-50 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Download size={20} />
        <p className="text-sm font-medium">Installez UrbanFlow</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 bg-white text-[var(--color-primary)] rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
        >
          Installer
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}