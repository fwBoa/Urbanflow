"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useLinesByMode } from "@/hooks/useTransport";
import type { LinesByMode, LineByMode } from "@/hooks/useTransport";

const MODE_TABS = [
  { key: "metro" as const, label: "Métro", emoji: "🚇" },
  { key: "rer" as const, label: "RER", emoji: "🚉" },
  { key: "tram" as const, label: "Tram", emoji: "🚊" },
  { key: "transilien" as const, label: "Transilien", emoji: "🚆" },
];

function LineBadge({ line }: { line: LineByMode }) {
  const isActive = line.status === "active";
  const isUpcoming = line.status === "prochainement active";

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] hover:shadow-sm transition-shadow cursor-default"
      title={`${line.shortName} — ${line.status}`}
    >
      <span
        className="inline-flex items-center justify-center min-w-[28px] h-[22px] px-1 rounded text-[11px] font-bold text-white"
        style={{ backgroundColor: `#${line.color}` }}
      >
        {line.shortName}
      </span>
      {isActive && <CheckCircle size={12} className="text-[var(--color-eco-green)]" />}
      {isUpcoming && <AlertCircle size={12} className="text-[var(--color-mobility-orange)]" />}
    </div>
  );
}

export default function LinesPage() {
  const { linesByMode, loading } = useLinesByMode();
  const [activeTab, setActiveTab] = useState<keyof LinesByMode>("metro");
  const lines = linesByMode[activeTab] || [];

  return (
    <AppShell title="Lignes en temps réel" showBack>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">
        État du trafic sur le réseau couvert par Urban Flow.
      </p>

      {loading ? (
        <div className="text-sm text-[var(--color-text-tertiary)] py-8 text-center">
          Chargement des lignes…
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {MODE_TABS.map((tab) => {
              const count = (linesByMode[tab.key] || []).length;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={isActive}
                  aria-label={`${tab.label} — ${count} ligne${count > 1 ? "s" : ""}`}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary)]/10"
                  }`}
                >
                  {tab.emoji} {tab.label} ({count})
                </button>
              );
            })}
          </div>

          {lines.length === 0 ? (
            <div className="text-sm text-[var(--color-text-tertiary)] py-8 text-center">
              Aucune ligne disponible
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lines.map((line) => (
                <LineBadge key={line.id} line={line} />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
