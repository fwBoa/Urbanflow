"use client";

import { useEffect, useState } from "react";

export default function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;

    async function registerSW() {
      try {
        const hadController = Boolean(navigator.serviceWorker.controller);
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        registration.addEventListener("updatefound", () => {
          const newWorker = registration?.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            // On n'affiche la bannière de mise à jour que s'il y avait déjà un
            // Service Worker actif (vraie mise à jour), pas lors de la première
            // visite ou de l'installation initiale.
            if (
              newWorker.state === "activated" &&
              hadController &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
            }
          });
        });

        // En dev on logue pour faciliter le debug PWA/push ; en prod on reste silencieux.
        if (process.env.NODE_ENV === "development") {
          console.log("✅ Service Worker registered:", registration.scope);
        }
      } catch (error) {
        console.error("❌ Service Worker registration failed:", error);
      }
    }

    registerSW();

    // Ré-enregistrement après un hot reload de Next/Turbopack si le SW a disparu.
    return () => {
      if (registration && typeof registration.unregister === "function") {
        registration.unregister().catch(() => {
          /* cleanup best-effort */
        });
      }
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--color-primary)] text-white p-4 rounded-xl shadow-lg z-50 flex flex-col gap-3">
      <p className="text-sm">
        Nouvelle version d’Urban Flow disponible. Rechargez pour appliquer les
        dernières améliorations.
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setUpdateAvailable(false)}
          className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white transition-colors"
        >
          Plus tard
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 bg-white text-[var(--color-primary)] rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
        >
          Mettre à jour
        </button>
      </div>
    </div>
  );
}