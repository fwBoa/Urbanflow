"use client";

import { ReactNode } from "react";

interface FilterChipProps {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

export default function FilterChip({ label, icon, active = false, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--chip-radius)] text-sm font-medium transition-all ${
        active
          ? "bg-[var(--color-primary)] text-white shadow-sm"
          : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]"
      }`}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}