"use client";

import { getModeIcon, getModeColor, getModeLabel, getTextColorForBackground } from "@/lib/modeMeta";

export interface ModeBadgeProps {
  /** Mode brut renvoyé par l'API : 'metro', 'rer', 'bus', 'tram', 'marche', 'velib', etc. */
  mode?: string;
  /** Type de segment GTFS : 'walking' | 'transit' | 'velib' */
  type?: "walking" | "transit" | "velib";
  /** Nom court de la ligne (ex: "A", "M1", "62"). Affiché à côté si fourni. */
  lineName?: string;
  /** Couleur HEX de la ligne (prioritaire sur la couleur calculée). */
  lineColor?: string;
  /** Taille du badge */
  size?: "sm" | "md" | "lg";
  /** Afficher le label texte à côté de l'icône */
  showLabel?: boolean;
}

const SIZE_CLASSES = {
  sm: { wrapper: "h-6 px-1.5 text-[10px] gap-1", icon: 12, lineText: "text-[10px]" },
  md: { wrapper: "h-8 px-2.5 text-xs gap-1.5", icon: 14, lineText: "text-xs" },
  lg: { wrapper: "h-10 px-3.5 text-sm gap-2", icon: 16, lineText: "text-sm" },
} as const;

/**
 * Badge de mode de transport — affichage unifié pour tous les types de segment.
 * - Couleur fidèle au réseau IDFM (lineColor > couleur de ligne connue > couleur par mode).
 * - Texte ajusté automatiquement selon la luminance du fond pour garder un bon contraste.
 */
export default function ModeBadge({
  mode,
  type,
  lineName,
  lineColor,
  size = "md",
  showLabel = false,
}: ModeBadgeProps) {
  const resolvedMode = type === "walking" ? "walking" : type === "velib" ? "velib" : mode;
  const Icon = getModeIcon(resolvedMode);
  const sizes = SIZE_CLASSES[size];

  const bg = lineColor || getModeColor(resolvedMode, lineName);
  const fg = getTextColorForBackground(bg);
  const label = getModeLabel(resolvedMode, lineName);

  return (
    <span
      className={`inline-flex items-center justify-center ${sizes.wrapper} font-semibold rounded-full shadow-sm shrink-0`}
      style={{ backgroundColor: bg, color: fg }}
      role="img"
      aria-label={label}
    >
      <Icon size={sizes.icon} />
      {lineName && (
        <span className={`font-bold ${sizes.lineText}`} style={{ color: fg }}>
          {lineName}
        </span>
      )}
      {showLabel && !lineName && (
        <span className={`font-semibold ${sizes.lineText}`} style={{ color: fg }}>
          {label.split(" ")[0]}
        </span>
      )}
    </span>
  );
}
