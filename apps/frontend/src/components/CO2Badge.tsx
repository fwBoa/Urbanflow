"use client";

import UrbanFlowIcon from "./icons/UrbanFlowIcon";

interface CO2BadgeProps {
  grams: number;
  label?: string;
  size?: "sm" | "md";
}

export default function CO2Badge({ grams, label, size = "sm" }: CO2BadgeProps) {
  const isZero = grams === 0;
  const displayValue = isZero ? "0" : grams < 1000 ? `${Math.round(grams)}g` : `${(grams / 1000).toFixed(1)}kg`;

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
      aria-label={`Empreinte carbone: ${displayValue} CO2`}
    >
      <UrbanFlowIcon type="status" name="leaf" size={size === "sm" ? 12 : 14} />
      {displayValue} CO₂{label && <span className="font-normal">· {label}</span>}
    </span>
  );
}