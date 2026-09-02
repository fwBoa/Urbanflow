"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";
import Header from "@/components/Header";
import NavBar from "@/components/NavBar";
import CO2Badge from "@/components/CO2Badge";
import DynamicMap from "@/components/DynamicMap";
import { getHistory } from "@/services/favorites";
import type { HistoryJourney } from "@/services/favorites";
import { formatModeLabel } from "@/lib/modeMeta";

export default function HomePage() {
  const router = useRouter();
  const [recentTrips, setRecentTrips] = useState<HistoryJourney[]>([]);

  // ─── Load recent trips from history ────────────────────────────────
  useEffect(() => {
    getHistory().then((history) => {
      // Take the 3 most recent
      setRecentTrips(history.slice(0, 3));
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* WCAG 2.4.1: Skip navigation link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:bg-background focus:text-[var(--color-text-primary)] focus:p-4 focus:outline focus:outline-2 focus:outline-[var(--color-primary)]"
      >
        Aller au contenu principal
      </a>
      {/* ─── Header ─── */}
      <Header title="UrbanFlow" rightAction={<NotificationBell />} />

      {/* ─── Main Content ─── */}
      <main id="main-content" className="flex-1 px-4 py-4 pb-[96px] max-w-lg mx-auto w-full">
        {/* ─── CTAs : entrées principales (itinéraire / Vélib') ─── */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => router.push("/search")}
            className="flex-1 h-[44px] rounded-[var(--chip-radius)] bg-[var(--color-primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            <UrbanFlowIcon type="action" name="locate" size={16} />
            Itinéraire
          </button>
          <button
            onClick={() => router.push("/velib")}
            className="flex-1 h-[44px] rounded-[var(--chip-radius)] bg-[var(--color-eco-green)] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#6DA33A] transition-colors"
          >
            <UrbanFlowIcon type="transport" name="bike" size={16} />
            Vélib&apos; proches
          </button>
        </div>

        {/* Map (centrée sur Paris — la vue Vélib' dédiée vit sur /velib) */}
        <div className="rounded-[var(--card-radius)] h-44 mb-6 border border-[var(--color-border)] overflow-hidden">
          <DynamicMap
            center={[48.8566, 2.3522]}
            zoom={13}
            userPosition={null}
          />
        </div>

        {/* Recent Trips */}
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-3">
          Trajets récents
        </h2>
        <div className="space-y-2">
          {recentTrips.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)] py-2">
              Aucun trajet récent. Lancez une recherche pour voir vos trajets ici.
            </p>
          ) : (
            recentTrips.map((trip, i) => (
              <button
                key={trip.id || i}
                onClick={() => router.push(`/search?mode=${encodeURIComponent(trip.mode.toLowerCase().replace(/['\s]/g, ""))}`)}
                className="w-full flex items-center gap-3 bg-surface rounded-[var(--card-radius)] p-3 border border-[var(--color-border)] hover:shadow-md transition-all text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {trip.from} → {trip.to}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1">
                      <UrbanFlowIcon type="status" name="clock" size={11} />
                      {trip.duration}
                    </span>
                    {trip.modeColor && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: trip.modeColor }}
                      >
                        {formatModeLabel(trip.mode)}
                      </span>
                    )}
                    <CO2Badge grams={trip.co2} />
                  </div>
                </div>
                <UrbanFlowIcon type="action" name="chevron-right" size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
              </button>
            ))
          )}
        </div>
      </main>

      {/* ─── Nav Bar ─── */}
      <NavBar />
    </div>
  );
}
