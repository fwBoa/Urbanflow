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
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        registration.addEventListener("updatefound", () => {
          const newWorker = registration?.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "activated" &&
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
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--color-primary)] text-white p-4 rounded-xl shadow-lg z-50 flex items-center justify-between">
      <p className="text-sm">Une mise à jour est disponible.</p>
      <button
        onClick={() => window.location.reload()}
        className="ml-2 px-3 py-1 bg-white text-[var(--color-primary)] rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
      >
        Mettre à jour
      </button>
    </div>
  );
}