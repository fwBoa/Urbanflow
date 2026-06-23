"use client";

import { useEffect, useState } from "react";

export default function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Disable SW in development (PWA not implemented yet)
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("[SW] Service Worker disabled in development");
      return;
    }

    async function registerSW() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
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

        // No success log in production (avoid console noise for end users);
        // a registration failure is still surfaced for diagnosis.
        if (process.env.NODE_ENV !== "production") {
          console.log("✅ Service Worker registered:", registration.scope);
        }
      } catch (error) {
        console.error("❌ Service Worker registration failed:", error);
      }
    }

    registerSW();
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