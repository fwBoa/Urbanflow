"use client";

import { Bus, Footprints, Bike, Train, TrainFront, TramFront, type LucideIcon } from "lucide-react";

// ─── Mapping stable des modes vers les composants Lucide déclarés hors render ─
const MODE_ICONS: Record<string, LucideIcon> = {
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

export default function ModeIcon({
  mode,
  size,
  className,
  style,
}: {
  mode?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = MODE_ICONS[normalizeMode(mode)] || Bus;
  return <Icon size={size} className={className} style={style} />;
}
