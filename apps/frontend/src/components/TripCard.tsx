"use client";

import { Clock, ArrowRight, AlertTriangle, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import CO2Badge from "./CO2Badge";
import ModeBadge from "./ModeBadge";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { JourneyResult, JourneySegment } from "@/services/api";

interface TripCardProps {
  journey: JourneyResult;
  departure: string;
  arrival: string;
  index?: number;
  onClick?: () => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.06,
      type: "spring" as const,
      stiffness: 320,
      damping: 28,
    },
  }),
  tap: { scale: 0.98 },
};

function formatTime(iso?: string): string {
  if (!iso) return "--:--";
  try {
    return iso.slice(0, 5);
  } catch {
    return "--:--";
  }
}

/** Retourne les segments de transit avec une ligne identifiable pour les badges. */
function transitSegments(segments: JourneySegment[]): JourneySegment[] {
  return segments.filter((s) => s.type === "transit" || s.type === "velib");
}

export default function TripCard({
  journey,
  departure,
  arrival,
  index = 0,
  onClick,
}: TripCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const transferLabel =
    journey.transfers === 0
      ? "Direct"
      : `${journey.transfers} correspondance${journey.transfers > 1 ? "s" : ""}`;

  const motionProps = reducedMotion
    ? { initial: false, animate: false, whileTap: undefined, whileHover: undefined }
    : {
        variants: cardVariants,
        initial: "hidden",
        animate: "visible",
        whileTap: "tap",
        whileHover: { y: -2 },
        custom: index,
      };

  const lines = transitSegments(journey.segments);
  const hasAlert = !!journey.alerts && journey.alerts.length > 0;
  const alertCount = journey.alerts?.length ?? 0;

  return (
    <motion.button
      onClick={onClick}
      type="button"
      className="group w-full text-left bg-surface rounded-[var(--card-radius)] border border-[var(--color-border)] p-4 hover:shadow-md hover:border-[var(--color-primary)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 transition-all overflow-hidden relative"
      aria-label={`Itinéraire ${lines.map((s) => s.lineName || s.mode).join(", ")}, ${journey.durationMinutes} min, ${transferLabel}, départ ${departure}, arrivée ${arrival}`}
      {...motionProps}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Colonne principale */}
        <div className="flex-1 min-w-0">
          {/* Ligne de pastilles de lignes + alerte */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {lines.length > 0 ? (
              lines.map((seg, idx) => (
                <ModeBadge
                  key={idx}
                  mode={seg.mode}
                  lineName={seg.lineName}
                  lineColor={seg.lineColor}
                  size="sm"
                />
              ))
            ) : (
              <ModeBadge mode="walking" size="sm" />
            )}
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {transferLabel}
            </span>
            {hasAlert && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                title="Perturbation sur une ligne de ce trajet"
              >
                <AlertTriangle size={10} aria-hidden="true" />
                {alertCount > 1 ? `${alertCount}` : ""}
                <span className="sr-only">Perturbation sur une ligne de ce trajet</span>
              </span>
            )}
          </div>

          {/* Départ → Arrivée */}
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <span className="truncate">{departure}</span>
            <span
              className="text-[var(--color-text-tertiary)] shrink-0 inline-flex transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              <ArrowRight size={14} />
            </span>
            <span className="truncate">{arrival}</span>
          </div>

          {/* Horaires */}
          <div className="flex items-center gap-2 mt-2 text-[11px] text-[var(--color-text-tertiary)]">
            <Calendar size={12} aria-hidden="true" />
            <span>
              {formatTime(journey.departureTime)} → {formatTime(journey.arrivalTime)}
            </span>
          </div>
        </div>

        {/* Colonne durée + CO₂ */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1 text-base font-bold text-[var(--color-primary)]">
            <Clock size={16} aria-hidden="true" />
            <span>{journey.durationMinutes} min</span>
          </div>
          <CO2Badge grams={journey.co2Ggrams} />
        </div>
      </div>
    </motion.button>
  );
}

// ─── Variants exportés pour stagger parent ─────────────────────────
export const tripListVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

// ─── Helpers CO₂ pour l'UI : badge "rapide" / "éco" ────────────────
export function tripBadge(
  journey: { durationMinutes: number; co2Ggrams: number; transfers: number },
  all: { durationMinutes: number; co2Ggrams: number }[],
) {
  const fastest = Math.min(...all.map((j) => j.durationMinutes));
  const lowestCo2 = Math.min(...all.map((j) => j.co2Ggrams));
  if (journey.durationMinutes === fastest && journey.co2Ggrams === lowestCo2) {
    return { label: "Optimal", color: "var(--color-primary)" };
  }
  if (journey.durationMinutes === fastest) {
    return { label: "Rapide", color: "var(--color-mobility-orange)" };
  }
  if (journey.co2Ggrams === lowestCo2) {
    return { label: "Éco", color: "var(--color-eco-green)" };
  }
  return null;
}
