"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useLinesByMode } from "@/hooks/useTransport";
import type { LinesByMode, LineByMode } from "@/hooks/useTransport";
import { useAuth } from "@/contexts/AuthContext";
import {
  getFavorites,
  addFavoriteLine,
  removeFavorite,
} from "@/services/favorites";

const MODE_TABS = [
  { key: "metro" as const, label: "Métro", emoji: "🚇" },
  { key: "rer" as const, label: "RER", emoji: "🚉" },
  { key: "tram" as const, label: "Tram", emoji: "🚊" },
  { key: "transilien" as const, label: "Transilien", emoji: "🚆" },
];

function LineBadge({
  line,
  isFavorite,
  onToggle,
}: {
  line: LineByMode;
  isFavorite: boolean;
  onToggle: () => void;
}) {
  const isActive = line.status === "active";
  const isUpcoming = line.status === "prochainement active";

  return (
    <div
      className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] hover:shadow-sm transition-shadow"
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        className="ml-0.5 p-0.5 rounded-full transition-colors"
      >
        <Heart
          size={12}
          className={
            isFavorite
              ? "fill-red-500 text-red-500"
              : "text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
          }
        />
      </button>
    </div>
  );
}

export default function LinesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { linesByMode, loading } = useLinesByMode();
  const [activeTab, setActiveTab] = useState<keyof LinesByMode>("metro");
  const [favoriteLines, setFavoriteLines] = useState<Map<string, string>>(new Map());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const lines = linesByMode[activeTab] || [];

  useEffect(() => {
    if (!isAuthenticated) return;
    getFavorites().then((favs) => {
      const map = new Map<string, string>();
      for (const f of favs) {
        if (f.type === "line" && f.lineId) {
          map.set(f.lineId, f.id);
        }
      }
      setFavoriteLines(map);
    });
  }, [isAuthenticated]);

  const handleToggle = async (line: LineByMode, mode: keyof LinesByMode) => {
    if (!isAuthenticated) {
      router.push("/login?redirect=/lines");
      return;
    }
    if (toggling.has(line.id)) return;
    setToggling((prev) => new Set(prev).add(line.id));
    try {
      if (favoriteLines.has(line.id)) {
        const favId = favoriteLines.get(line.id);
        if (favId) {
          await removeFavorite(favId);
          setFavoriteLines((prev) => {
            const next = new Map(prev);
            next.delete(line.id);
            return next;
          });
        }
      } else {
        const fav = await addFavoriteLine({
          lineId: line.id,
          lineName: line.shortName,
          mode,
          modeColor: line.color,
        });
        setFavoriteLines((prev) => new Map(prev).set(line.id, fav.id));
      }
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(line.id);
        return next;
      });
    }
  };

  return (
    <AppShell title="Lignes en temps réel" showBack>
      <p className="text-sm text-[var(--color-text-secondary)] mb-4">
        État du trafic sur le réseau couvert par Urban Flow.
        {!isAuthenticated && (
          <span className="block text-xs text-[var(--color-text-tertiary)] mt-1">
            Connectez-vous pour ajouter des lignes en favori.
          </span>
        )}
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
                <LineBadge
                  key={line.id}
                  line={line}
                  isFavorite={favoriteLines.has(line.id)}
                  onToggle={() => handleToggle(line, activeTab)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
