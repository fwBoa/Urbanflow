"use client";

import UrbanFlowIcon from "./icons/UrbanFlowIcon";

// Facteur d'émission ADEME voiture thermique (gCO2/km) — même source que
// le CarbonService backend. Permet d'afficher les CO2 évités vs voiture
// sans appel supplémentaire (C4 : valeur ajoutée visible dans le flow).
const CAR_FACTOR_GCO2_PER_KM = 170;

interface CO2BadgeProps {
  grams: number;
  label?: string;
  size?: "sm" | "md";
  /** Distance totale du trajet en km — si fournie, affiche les CO2 évités vs voiture. */
  distanceKm?: number;
}

export default function CO2Badge({
  grams,
  label,
  size = "sm",
  distanceKm,
}: CO2BadgeProps) {
  const isZero = grams === 0;
  const displayValue = isZero ? "0" : grams < 1000 ? `${Math.round(grams)}g` : `${(grams / 1000).toFixed(1)}kg`;

  // C4 : grammes évités vs voiture (facteur ADEME 170 g/km), cohérent avec
  // le CarbonService. Uniquement quand la distance est connue et positive.
  const saved =
    distanceKm && distanceKm > 0 ? Math.round(distanceKm * CAR_FACTOR_GCO2_PER_KM) : null;

  const title = saved
    ? `Empreinte carbone: ${displayValue} CO2 — environ ${saved < 1000 ? `${saved}g` : `${(saved / 1000).toFixed(1)}kg`} évités vs voiture (facteur ADEME)`
    : `Empreinte carbone: ${displayValue} CO2`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${
        size === "sm"
          ? "px-2 py-0.5 text-[11px]"
          : "px-3 py-1 text-xs"
      } ${
        isZero
          ? "bg-[var(--color-eco-green)]/10 text-[var(--color-eco-green)]"
          : "bg-[var(--color-eco-green)]/10 text-[var(--color-eco-green)]"
      }`}
      aria-label={title}
      title={title}
    >
      <UrbanFlowIcon type="status" name="leaf" size={size === "sm" ? 12 : 14} />
      {displayValue} CO₂
      {saved ? (
        <span className="font-normal opacity-90">
          · {saved < 1000 ? `${saved}g` : `${(saved / 1000).toFixed(1)}kg`} évités vs voiture
        </span>
      ) : (
        label && <span className="font-normal">· {label}</span>
      )}
    </span>
  );
}