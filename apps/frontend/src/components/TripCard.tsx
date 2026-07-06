"use client";

import { Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import CO2Badge from "./CO2Badge";
import ModeBadge from "./ModeBadge";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface TripCardProps {
  departure: string;
  arrival: string;
  duration: string;
  transfers: number;
  co2: number;
  mode: string;
  modeColor: string;
  hasAlert?: boolean;
  alertCount?: number;
  /** Indice dans la liste — pour stagger animation */
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

export default function TripCard({
  departure,
  arrival,
  duration,
  transfers,
  co2,
  mode,
  modeColor,
  hasAlert,
  alertCount,
  index = 0,
  onClick,
}: TripCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const transferLabel =
    transfers === 0 ? "Direct" : `${transfers} correspondance${transfers > 1 ? "s" : ""}`;

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

  return (
    <motion.button
      onClick={onClick}
      type="button"
      className="group w-full text-left bg-surface rounded-[var(--card-radius)] border border-[var(--color-border)] p-4 hover:shadow-md hover:border-[var(--color-primary)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 transition-all overflow-hidden relative"
      aria-label={`Itinéraire ${mode}, ${duration}, ${transferLabel}, départ ${departure}, arrivée ${arrival}`}
      {...motionProps}
    >
      {/* Ligne colorée sur la gauche */}
      <motion.div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 origin-top"
        style={{ backgroundColor: modeColor }}
        initial={reducedMotion ? false : { scaleY: 0 }}
        animate={reducedMotion ? false : { scaleY: 1 }}
        transition={reducedMotion ? undefined : { duration: 0.4, delay: index * 0.06 + 0.1 }}
      />

      <div className="flex items-start justify-between gap-3">
        {/* Colonne principale */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <ModeBadge mode={mode} lineName={mode} lineColor={modeColor} size="sm" />
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {transferLabel}
            </span>
            {hasAlert && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                title="Perturbation sur une ligne de ce trajet"
              >
                <AlertTriangle size={10} aria-hidden="true" />
                {alertCount && alertCount > 1 ? `${alertCount}` : ""}
                <span className="sr-only">Perturbation sur une ligne de ce trajet</span>
              </span>
            )}
          </div>

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
        </div>

        {/* Colonne durée + CO₂ */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
            <Clock size={14} aria-hidden="true" />
            <span>{duration}</span>
          </div>
          <CO2Badge grams={co2} />
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
