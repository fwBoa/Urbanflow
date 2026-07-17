"use client";

import { Bus, Footprints, Bike, Train, TrainFront, TramFront } from "lucide-react";
import UrbanFlowIcon from "./icons/UrbanFlowIcon";

// ─── Mapping stable des modes vers les icônes UrbanFlow du pack ─────────────
// Si une icône manque dans le pack, on conserve Lucide en fallback.
function getUrbanFlowTransportName(mode: string): string | null {
  if (mode.includes("velib") || mode.includes("velo")) return "bike";
  if (mode.includes("bus")) return "bus";
  if (mode.includes("tram")) return "train"; // le pack n'a pas de tram dédié
  if (mode.includes("metro") || mode.includes("rer") || mode.includes("transilien") || mode.includes("train")) return "train";
  if (mode.includes("marche") || mode.includes("walking") || mode.includes("foot")) return "walk";
  return null;
}

function normalizeMode(mode?: string): string {
  if (!mode) return "walking";
  const m = mode.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (m.includes("velib") || m.includes("velo")) return "velib";
  if (m.includes("velo")) return "velib";
  if (m.includes("tram")) return "tram";
  if (m.includes("metro")) return "metro";
  if (m.includes("rer")) return "rer";
  if (m.includes("transilien")) return "transilien";
  if (m.includes("train")) return "train";
  if (m.includes("bus")) return "bus";
  if (m.includes("marche") || m.includes("walking") || m.includes("foot")) return "walking";
  return m;
}

const LUCIDE_FALLBACKS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  metro: TrainFront,
  rer: Train,
  transilien: Train,
  train: Train,
  tram: TramFront,
  bus: Bus,
  velib: Bike,
  walking: Footprints,
};

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
  const normalized = normalizeMode(mode);
  const ufName = getUrbanFlowTransportName(normalized);

  if (ufName) {
    return (
      <UrbanFlowIcon
        type="transport"
        name={ufName}
        size={size ?? 24}
        className={className}
        ariaHidden={true}
        style={style}
      />
    );
  }

  const Fallback = LUCIDE_FALLBACKS[normalized] || Bus;
  return <Fallback size={size} className={className} style={style} />;
}
