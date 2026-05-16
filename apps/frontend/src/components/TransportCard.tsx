"use client";

import { ReactNode } from "react";

interface TransportCardProps {
  icon: ReactNode;
  label: string;
  color: string;
  subtitle?: string;
  onClick?: () => void;
}

export default function TransportCard({ icon, label, color, subtitle, onClick }: TransportCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-[var(--card-radius)] p-4 border border-[var(--color-border)] flex flex-col items-center gap-2 cursor-pointer hover:shadow-lg hover:border-transparent transition-all active:scale-[0.97] w-full"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-semibold" style={{ color }}>
        {label}
      </span>
      {subtitle && (
        <span className="text-[11px] text-[var(--color-text-tertiary)] leading-tight text-center">
          {subtitle}
        </span>
      )}
    </button>
  );
}