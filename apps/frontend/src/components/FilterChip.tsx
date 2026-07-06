"use client";

import { ReactNode } from "react";

interface FilterChipProps {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  /** Variante visuelle : filter (choix unique, style plein) ou mode (toggle multi, style outline) */
  variant?: "filter" | "mode";
  /** Désactiver le chip */
  disabled?: boolean;
  /** Taille */
  size?: "sm" | "md";
}

export default function FilterChip({
  label,
  icon,
  active = false,
  onClick,
  variant = "filter",
  disabled = false,
  size = "md",
}: FilterChipProps) {
  const isMode = variant === "mode";

  const baseClasses =
    "inline-flex items-center gap-1.5 font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed";

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-full",
    md: "px-4 py-2 text-sm rounded-[var(--chip-radius)]",
  };

  const stateClasses = active
    ? isMode
      ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]"
      : "bg-[var(--color-primary)] text-white shadow-sm"
    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-text-primary)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`${baseClasses} ${sizeClasses[size]} ${stateClasses}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
    </button>
  );
}
