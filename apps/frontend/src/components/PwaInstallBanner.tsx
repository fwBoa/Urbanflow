"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Download, X, Share2 } from "lucide-react";

// L'événement `beforeinstallprompt` n'est pas typé dans les lib DOM standards.
// On déclare le sous-ensemble utilisé (prompt() + userChoice) pour éviter `any`.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type DeviceKind = "ios" | "android" | "desktop" | "unknown";

/**
 * Détecte la plateforme de l'utilisateur.
 * iOS ne supporte pas beforeinstallprompt : il faut afficher un guide manuel.
 * Android/Chrome supporte l'installation native via beforeinstallprompt.
 * Desktop Chrome/Edge aussi, mais on affiche un guide adapté.
 */
function detectDevice(): DeviceKind {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "desktop";
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
  const device = useSyncExternalStore(
    () => () => {},
    detectDevice,
    () => "unknown" as DeviceKind,
  );
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

  const showNativePrompt = Boolean(deferredPrompt) && device !== "ios";
  const isIOS = device === "ios";

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--color-primary)] text-white p-4 rounded-xl shadow-lg z-50 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Download size={20} />
          <p className="text-sm font-medium">Installez UrbanFlow</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>
      </div>

      {isIOS ? (
        <div className="text-sm text-white/90 space-y-2">
          <p className="flex items-start gap-2">
            <Share2 size={16} className="shrink-0 mt-0.5" />
            <span>
              Sur iPhone/iPad, appuyez sur le bouton <strong>Partager</strong> de
              Safari, puis sélectionnez{" "}
              <strong>«&nbsp;Ajouter à l&apos;écran d&apos;accueil&nbsp;»</strong>.
            </span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-white/90">
          Ajoutez UrbanFlow à votre écran d&apos;accueil pour un accès rapide,
          même hors ligne.
        </p>
      )}

      {showNativePrompt && !isIOS && (
        <div className="flex items-center justify-end">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 bg-white text-[var(--color-primary)] rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
          >
            Installer
          </button>
        </div>
      )}
    </div>
  );
}
