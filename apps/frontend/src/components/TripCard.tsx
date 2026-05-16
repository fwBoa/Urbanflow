"use client";

import { Clock, ArrowRight } from "lucide-react";
import CO2Badge from "./CO2Badge";

interface TripCardProps {
  departure: string;
  arrival: string;
  duration: string;
  transfers: number;
  co2: number;
  mode: string;
  modeColor: string;
  onClick?: () => void;
}

export default function TripCard({
  departure,
  arrival,
  duration,
  transfers,
  co2,
  mode,
  modeColor,
  onClick,
}: TripCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-[var(--card-radius)] border border-[var(--color-border)] p-4 hover:shadow-md transition-all active:scale-[0.98] text-left"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: modeColor }}
            >
              {mode}
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {transfers === 0 ? "Direct" : `${transfers} correspondance${transfers > 1 ? "s" : ""}`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <span className="truncate">{departure}</span>
            <ArrowRight size={14} className="text-[var(--color-text-tertiary)] shrink-0" />
            <span className="truncate">{arrival}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <div className="flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)]">
            <Clock size={14} />
            {duration}
          </div>
          <CO2Badge grams={co2} />
        </div>
      </div>
    </button>
  );
}