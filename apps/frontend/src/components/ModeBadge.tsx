"use client";

import { Footprints, Bike, Train, TramFront, Bus, Ship, Car, Zap } from "lucide-react";

export interface ModeBadgeProps {
  /** Mode brut renvoyé par l'API : 'metro', 'rer', 'bus', 'tram', 'marche', 'velib', etc. */
  mode?: string;
  /** Type de segment GTFS : 'walking' | 'transit' | 'velib' | 'trottinette' */
  type?: "walking" | "transit" | "velib" | "trottinette";
  /** Nom court de la ligne (ex: "A", "M1", "62"). Affiché à côté si fourni. */
  lineName?: string;
  /** Couleur HEX de la ligne (prioritaire sur la couleur par défaut du mode). */
  lineColor?: string;
  /** Taille du badge */
  size?: "sm" | "md" | "lg";
  /** Afficher le label texte sous l'icône */
  showLabel?: boolean;
}

interface ModeMeta {
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  /** Couleur de fond par défaut (fallback si pas de lineColor) */
  defaultBg: string;
  /** Couleur de texte par défaut */
  defaultFg: string;
}

const MODE_META: Record<string, ModeMeta> = {
  metro: { label: "Métro", Icon: Train, defaultBg: "#1A5A73", defaultFg: "#FFFFFF" },
  rer: { label: "RER", Icon: Train, defaultBg: "#9C27B0", defaultFg: "#FFFFFF" },
  tram: { label: "Tram", Icon: TramFront, defaultBg: "#7B1FA2", defaultFg: "#FFFFFF" },
  bus: { label: "Bus", Icon: Bus, defaultBg: "#0288D1", defaultFg: "#FFFFFF" },
  marche: { label: "Marche", Icon: Footprints, defaultBg: "#455A64", defaultFg: "#FFFFFF" },
  velib: { label: "Vélib'", Icon: Bike, defaultBg: "#7CB342", defaultFg: "#FFFFFF" },
  trottinette: { label: "Trottinette", Icon: Zap, defaultBg: "#F57C00", defaultFg: "#FFFFFF" },
  train: { label: "Train", Icon: Train, defaultBg: "#1976D2", defaultFg: "#FFFFFF" },
  transilien: { label: "Transilien", Icon: Train, defaultBg: "#283593", defaultFg: "#FFFFFF" },
  ferry: { label: "Ferry", Icon: Ship, defaultBg: "#00838F", defaultFg: "#FFFFFF" },
  car: { label: "Voiture", Icon: Car, defaultBg: "#424242", defaultFg: "#FFFFFF" },
};

function getModeMeta(mode?: string, type?: ModeBadgeProps["type"]): ModeMeta {
  if (type === "walking" || mode?.toLowerCase() === "marche" || mode?.toLowerCase() === "walking") {
    return MODE_META.marche!;
  }
  if (type === "velib" || mode?.toLowerCase().includes("vélib") || mode?.toLowerCase().includes("velib")) {
    return MODE_META.velib!;
  }
  if (type === "trottinette" || mode?.toLowerCase().includes("trottinette")) {
    return MODE_META.trottinette!;
  }
  const m = (mode || "").toLowerCase().trim();
  // Match exact ou préfixe
  if (m === "metro" || m.includes("métro")) return MODE_META.metro!;
  if (m.includes("rer")) return MODE_META.rer!;
  if (m.includes("tram")) return MODE_META.tram!;
  if (m.includes("transilien")) return MODE_META.transilien!;
  if (m.includes("train")) return MODE_META.train!;
  if (m.includes("ferry") || m.includes("navette")) return MODE_META.ferry!;
  if (m.includes("bus") || m.includes("car")) return MODE_META.bus!;
  return { label: mode || "Transit", Icon: Bus, defaultBg: "#455A64", defaultFg: "#FFFFFF" };
}

const SIZE_CLASSES = {
  sm: { wrapper: "h-7 px-2 text-[11px] gap-1.5", icon: 12, lineText: "text-[11px]" },
  md: { wrapper: "h-9 px-3 text-xs gap-2", icon: 14, lineText: "text-xs" },
  lg: { wrapper: "h-11 px-4 text-sm gap-2", icon: 16, lineText: "text-sm" },
} as const;

/**
 * Badge de mode de transport — affichage unifié pour tous les types de segment.
 * - Si lineColor fourni : utilise la couleur de la ligne (ex: RER A rouge, M1 jaune)
 * - Sinon : utilise la couleur par défaut du mode
 */
export default function ModeBadge({
  mode,
  type,
  lineName,
  lineColor,
  size = "md",
  showLabel = false,
}: ModeBadgeProps) {
  const meta = getModeMeta(mode, type);
  const Icon = meta.Icon;
  const sizes = SIZE_CLASSES[size];

  const bg = lineColor ?? meta.defaultBg;
  const fg = "#FFFFFF";

  return (
    <span
      className={`inline-flex items-center justify-center ${sizes.wrapper} font-semibold rounded-full shadow-sm`}
      style={{ backgroundColor: bg, color: fg }}
      role="img"
      aria-label={`${meta.label}${lineName ? ` ligne ${lineName}` : ""}`}
    >
      <Icon size={sizes.icon} />
      {lineName && (
        <span className={`font-bold ${sizes.lineText}`} style={{ color: fg }}>
          {lineName}
        </span>
      )}
      {showLabel && (
        <span className={`font-semibold ${sizes.lineText}`} style={{ color: fg }}>
          {meta.label}
        </span>
      )}
    </span>
  );
}
