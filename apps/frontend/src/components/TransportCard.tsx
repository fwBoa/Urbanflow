"use client";

import { ReactNode, useState } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";

interface TransportModeLine {
  id: string;
  name: string;
  shortName: string;
  color: string;
  status: string;
}

interface TransportCardProps {
  icon: ReactNode;
  label: string;
  color: string;
  subtitle?: string;
  statusBadge?: "normal" | "perturbation" | "indisponible";
  topLines?: TransportModeLine[];
  onClick?: () => void;
}

export default function TransportCard({ icon, label, color, subtitle, statusBadge, topLines, onClick }: TransportCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasLines = topLines && topLines.length > 0;

  return (
    <button
      onClick={() => {
        if (hasLines) {
          setExpanded(!expanded);
        } else {
          onClick?.();
        }
      }}
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
      {statusBadge === "normal" && (
        <div className="flex items-center gap-1 mt-0.5">
          <CheckCircle size={11} className="text-[var(--color-eco-green)]" />
          <span className="text-[10px] text-[var(--color-eco-green)]">Normal</span>
        </div>
      )}
      {statusBadge === "perturbation" && (
        <div className="flex items-center gap-1 mt-0.5">
          <AlertTriangle size={11} className="text-[var(--color-mobility-orange)]" />
          <span className="text-[10px] text-[var(--color-mobility-orange)]">Perturbation</span>
        </div>
      )}
      {hasLines && expanded && (
        <div className="w-full mt-2 pt-2 border-t border-[var(--color-border)]">
          <div className="flex flex-wrap gap-1 justify-center">
            {topLines.map((line) => (
              <span
                key={line.id}
                className="inline-flex items-center justify-center min-w-[28px] h-[22px] px-1 rounded text-[10px] font-bold text-white"
                style={{ backgroundColor: `#${line.color}` }}
              >
                {line.shortName}
              </span>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}