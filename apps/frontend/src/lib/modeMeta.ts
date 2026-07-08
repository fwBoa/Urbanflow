import {
  Bus,
  Footprints,
  Bike,
  Train,
  TrainFront,
  TramFront,
  type LucideIcon,
} from "lucide-react";

// ─── Couleurs IDFM officielles pour les lignes et modes ───────────────
// Sources : palette institutionnelle IDFM + couleurs de ligne connues.
// Quand une ligne fournit sa propre lineColor, on l'utilise. Sinon on
// replie sur ces couleurs par mode.
export const MODE_COLORS: Record<string, string> = {
  metro: "#FFCE00",
  rer: "#E3051C",
  transilien: "#6E6E00",
  train: "#6E6E00",
  tram: "#6E1B78",
  bus: "#FFBE00",
  velib: "#009AA6",
  velo: "#009AA6",
  walking: "#2E7D9B",
  marche: "#2E7D9B",
};

export const LINE_COLORS: Record<string, string> = {
  "metro-1": "#FFCE00",
  "metro-2": "#0055C8",
  "metro-3": "#6E6E00",
  "metro-3bis": "#6E6E00",
  "metro-4": "#A0006E",
  "metro-5": "#FF7E2E",
  "metro-6": "#6ECA97",
  "metro-7": "#FA9ABA",
  "metro-7bis": "#FA9ABA",
  "metro-8": "#E19BDF",
  "metro-9": "#6EC4E8",
  "metro-10": "#C9910D",
  "metro-11": "#6E491E",
  "metro-12": "#007852",
  "metro-13": "#6ECA97",
  "metro-14": "#62259D",
  "rer-a": "#E3051C",
  "rer-b": "#5291CE",
  "rer-c": "#FFCC30",
  "rer-d": "#008E4F",
  "rer-e": "#C04191",
  "tram-1": "#6E1B78",
  "tram-2": "#C04191",
  "tram-3a": "#FF7E2E",
  "tram-3b": "#6EC4E8",
  "tram-4": "#6E491E",
  "tram-5": "#62259D",
  "tram-6": "#FFBE00",
  "tram-7": "#6ECA97",
  "tram-8": "#E19BDF",
};

// ─── Icônes Lucide par mode de transport ─────────────────────────────
export const MODE_ICONS: Record<string, LucideIcon> = {
  metro: TrainFront,
  rer: Train,
  transilien: Train,
  train: Train,
  tram: TramFront,
  bus: Bus,
  velib: Bike,
  velo: Bike,
  walking: Footprints,
  marche: Footprints,
};

/** Normalise un identifiant de mode (insensible à la casse et aux accents). */
function normalizeMode(mode?: string): string {
  if (!mode) return "walking";
  const m = mode.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (m.includes("velib") || m.includes("velo")) return "velib";
  if (m.includes("tram")) return "tram";
  if (m.includes("metro")) return "metro";
  if (m.includes("rer")) return "rer";
  if (m.includes("transilien")) return "transilien";
  if (m.includes("train")) return "train";
  if (m.includes("bus")) return "bus";
  if (m.includes("marche") || m.includes("walking") || m.includes("foot")) return "walking";
  return m;
}

/** Retourne l'icône Lucide associée à un mode. */
export function getModeIcon(mode?: string): LucideIcon {
  return MODE_ICONS[normalizeMode(mode)] || Bus;
}

/** Retourne la couleur de fond pour un mode/ligne. */
export function getModeColor(mode?: string, lineName?: string): string {
  const normalized = normalizeMode(mode);
  const key = `${normalized}-${(lineName || "").toLowerCase().replace(/\s+/g, "")}`;
  return LINE_COLORS[key] || MODE_COLORS[normalized] || "#2E7D9B";
}

/** Calcule la luminance relative d'une couleur hex. */
function luminance(hex: string): number {
  const rgb = hex
    .replace("#", "")
    .match(/\w\w/g)
    ?.map((x) => parseInt(x, 16) / 255) || [0, 0, 0];
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Retourne la couleur de texte (blanc ou noir) selon la luminance du fond. */
export function getTextColorForBackground(hex: string): "#FFFFFF" | "#1F2937" {
  return luminance(hex) > 0.5 ? "#1F2937" : "#FFFFFF";
}

/** Label français lisible pour un mode. */
export function getModeLabel(mode?: string, lineName?: string): string {
  const normalized = normalizeMode(mode);
  const labels: Record<string, string> = {
    metro: "Métro",
    rer: "RER",
    transilien: "Transilien",
    train: "Train",
    tram: "Tram",
    bus: "Bus",
    velib: "Vélib'",
    velo: "Vélo",
    walking: "Marche",
    marche: "Marche",
  };
  const label = labels[normalized] || mode || "Transit";
  if (lineName && ["rer", "metro", "tram"].includes(normalized)) {
    return `${label} ${lineName}`;
  }
  return label;
}
