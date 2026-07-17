"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import ModeBadge from "./ModeBadge";
import UrbanFlowIcon from "./icons/UrbanFlowIcon";

interface Departure {
  tripId: string;
  departureTime: string;
  headsign: string;
  lineName: string;
  lineColor: string;
  platform?: string;
  waitMinutes: number;
}

interface NearbyStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: Array<{ id: string; name: string; color: string }>;
}

interface NearbyStopDrawerProps {
  stop: NearbyStop | null;
  departures: Departure[];
  loading: boolean;
  onClose: () => void;
  onUseAsOrigin: (stop: NearbyStop) => void;
}

export default function NearbyStopDrawer({
  stop,
  departures,
  loading,
  onClose,
  onUseAsOrigin,
}: NearbyStopDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `nearby-stop-title-${stop?.id ?? "empty"}`;

  // Fermeture avec Escape
  useEffect(() => {
    if (!stop) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [stop, onClose]);

  // Focus initial sur le bouton fermer quand le drawer s'ouvre
  useEffect(() => {
    if (stop) {
      closeButtonRef.current?.focus();
    }
  }, [stop]);

  return (
    <AnimatePresence>
      {stop && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-[var(--card-radius)] shadow-2xl border-t border-[var(--color-border)] max-h-[80vh] overflow-y-auto"
          >
            {/* Handle visuel pour mobile */}
            <div className="w-full flex justify-center pt-2 pb-1" aria-hidden="true">
              <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
            </div>

            <div className="p-4 pt-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <p id={titleId} className="text-base font-semibold text-[var(--color-text-primary)] truncate">
                    {stop.name}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">
                    Prochains départs
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-surface)] flex items-center justify-center hover:bg-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
                  aria-label="Fermer les prochains départs"
                >
                  <UrbanFlowIcon type="action" name="close" size={18} />
                </button>
              </div>

              {/* Action : utiliser comme départ */}
              <button
                type="button"
                onClick={() => onUseAsOrigin(stop)}
                className="w-full mb-4 h-11 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 transition-colors flex items-center justify-center gap-2"
              >
                <UrbanFlowIcon type="action" name="locate" size={16} />
                Définir comme départ
              </button>

              {/* Liste des départs */}
              <div className="space-y-2">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
                    <span className="text-sm text-[var(--color-text-tertiary)]">Chargement des départs…</span>
                  </div>
                )}

                {!loading && departures.length === 0 && (
                  <div className="text-center py-6 px-4 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <UrbanFlowIcon
                      type="status"
                      name="alert"
                      size={24}
                      className="mx-auto mb-2 text-[var(--color-text-tertiary)]"
                    />
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Aucun départ prévu prochainement
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                      Les horaires temps réel peuvent être momentanément indisponibles.
                    </p>
                  </div>
                )}

                {!loading &&
                  departures.map((dep) => (
                    <div
                      key={`${dep.tripId}-${dep.departureTime}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
                    >
                      {/* Badge ligne */}
                      <ModeBadge
                        mode={dep.lineName.toLowerCase().startsWith("rer") ? "rer" : dep.lineName.toLowerCase().startsWith("m") ? "metro" : "bus"}
                        lineName={dep.lineName}
                        lineColor={dep.lineColor}
                        size="sm"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {dep.headsign}
                        </p>
                        {dep.platform && (
                          <p className="text-[11px] text-[var(--color-text-tertiary)]">
                            Voie {dep.platform}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[var(--color-primary)]">
                          {dep.departureTime.slice(0, 5)}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-tertiary)]">
                          {dep.waitMinutes <= 0
                            ? "À l'approche"
                            : dep.waitMinutes === 1
                              ? "1 min"
                              : `${dep.waitMinutes} min`}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
