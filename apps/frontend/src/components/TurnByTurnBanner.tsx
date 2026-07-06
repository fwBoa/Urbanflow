"use client";

import { motion } from "framer-motion";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  LogIn,
  LogOut,
  Footprints,
  Train,
  Bike,
  type LucideIcon,
} from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { NavigationInstruction } from "@/hooks/useNavigation";

// ─── Icône de direction par type de manœuvre (map module-level) ───────
// Accès par propriété (et non appel de fonction) — évite la règle
// react-hooks/static-components (composant "créé pendant le render").
const INSTRUCTION_ICONS: Record<NavigationInstruction["icon"], LucideIcon> = {
  straight: ArrowUp,
  depart: ArrowUp,
  "slight-left": ArrowUpLeft,
  left: CornerUpLeft,
  "slight-right": ArrowUpRight,
  right: CornerUpRight,
  arrive: Flag,
  board: LogIn,
  alight: LogOut,
};

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface TurnByTurnBannerProps {
  instruction: NavigationInstruction;
  /** Couleur d'accent (ligne du segment actif) — optionnel */
  accentColor?: string;
}

/**
 * Bannière d'instruction turn-by-turn, overlay `fixed` ancré sous le header,
 * rendue uniquement pendant la navigation. Carte orientée au cap + zoom actif en
 * complément (gérés par DynamicMap). Gate motion via prefers-reduced-motion.
 */
export default function TurnByTurnBanner({ instruction, accentColor }: TurnByTurnBannerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const Icon = INSTRUCTION_ICONS[instruction.icon] ?? ArrowUp;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: -12 }}
      animate={reducedMotion ? false : { opacity: 1, y: 0 }}
      transition={reducedMotion ? undefined : { duration: 0.25, ease: "easeOut" }}
      className="fixed left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1rem)] max-w-lg"
      style={{ top: "calc(var(--header-height) + 0.5rem)" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg p-2.5">
        {/* Pastille direction */}
        <div
          className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white shadow"
          style={{ backgroundColor: accentColor || "var(--color-primary)" }}
        >
          <Icon size={22} strokeWidth={2.5} />
        </div>

        {/* Instruction */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-[var(--color-text-tertiary)] leading-tight">
            {instruction.icon === "arrive"
              ? "Arrivée"
              : instruction.icon === "board"
                ? "Monter"
                : instruction.icon === "alight"
                  ? "Descente"
                  : "Instruction"}
          </p>
          <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2">
            {instruction.text}
          </p>
        </div>

        {/* Distance au prochain manœuvre */}
        <div className="shrink-0 text-right">
          <p className="text-base font-bold text-[var(--color-primary)] leading-none">
            {formatDistance(instruction.distanceToNext)}
          </p>
          {instruction.timeToNext > 0 && (
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              {Math.ceil(instruction.timeToNext)} min
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Icône mode réservée à un éventuel usage futur (segment walking/velib).
export const MODE_ICON: Record<string, LucideIcon> = {
  walking: Footprints,
  transit: Train,
  velib: Bike,
};