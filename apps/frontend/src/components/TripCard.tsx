"use client";

import { Clock, ArrowRight, AlertTriangle, Zap, Leaf } from "lucide-react";
import { motion } from "framer-motion";
import CO2Badge from "./CO2Badge";
import ModeBadge from "./ModeBadge";

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
  return (
    <motion.button
      onClick={onClick}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileTap="tap"
      whileHover={{ y: -2 }}
      custom={index}
      className="w-full bg-white rounded-[var(--card-radius)] border border-[var(--color-border)] p-4 hover:shadow-lg transition-shadow text-left overflow-hidden relative"
    >
      {/* Pulse line on the left */}
      <motion.div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 origin-top"
        style={{ backgroundColor: modeColor }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.4, delay: index * 0.06 + 0.1 }}
      />
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <ModeBadge
              mode={mode}
              lineName={mode}
              lineColor={modeColor}
              size="sm"
            />
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {transfers === 0 ? "Direct" : `${transfers} correspondance${transfers > 1 ? "s" : ""}`}
            </span>
            {hasAlert && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700"
                title="Perturbation sur une ligne de ce trajet"
              >
                <AlertTriangle size={10} />
                {alertCount && alertCount > 1 ? `${alertCount}` : ""}
              </motion.span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <span className="truncate">{departure}</span>
            <motion.span
              animate={{ x: [0, 3, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="text-[var(--color-text-tertiary)] shrink-0 inline-flex"
            >
              <ArrowRight size={14} />
            </motion.span>
            <span className="truncate">{arrival}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <div className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
            <Clock size={14} />
            {duration}
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
export function tripBadge(journey: { durationMinutes: number; co2Ggrams: number; transfers: number }, all: { durationMinutes: number; co2Ggrams: number }[]) {
  const fastest = Math.min(...all.map((j) => j.durationMinutes));
  const lowestCo2 = Math.min(...all.map((j) => j.co2Ggrams));
  if (journey.durationMinutes === fastest && journey.co2Ggrams === lowestCo2) {
    return { icon: <Zap size={11} />, label: "Optimal", color: "#2E7D9B" };
  }
  if (journey.durationMinutes === fastest) {
    return { icon: <Zap size={11} />, label: "Rapide", color: "#FF6B35" };
  }
  if (journey.co2Ggrams === lowestCo2) {
    return { icon: <Leaf size={11} />, label: "Éco", color: "#7CB342" };
  }
  return null;
}
