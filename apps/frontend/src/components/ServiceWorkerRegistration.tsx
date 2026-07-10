"use client";

import { useEffect, useState } from "react";

export default function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;
    let previousController: ServiceWorker | null =
      navigator.serviceWorker.controller;

    async function registerSW() {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Logue l'installation d'une nouvelle version du worker.
        registration.addEventListener("updatefound", () => {
          const newWorker = registration?.installing;
          if (!newWorker) return;

          if (process.env.NODE_ENV === "development") {
            console.log("[SW] updatefound:", newWorker.state);
          }
        });

        // Événement canonique déclenché quand le controller actif change.
        // C'est le signal fiable qu'une nouvelle version du SW a pris le relais.
        const onControllerChange = () => {
          const newController = navigator.serviceWorker.controller;
          const hadController = Boolean(previousController);
          const controllerChanged = previousController !== newController;

          if (process.env.NODE_ENV === "development") {
            console.log("[SW] controllerchange", {
              hadController,
              controllerChanged,
              previous: previousController?.scriptURL,
              current: newController?.scriptURL,
            });
          }

          if (hadController && controllerChanged && newController) {
            setUpdateAvailable(true);
          }

          previousController = newController;
        };

        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange,
        );

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