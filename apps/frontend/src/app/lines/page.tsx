"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";
import { motion } from "framer-motion";
import AppShell from "@/components/AppShell";
import { useLinesByMode, useRealtimeAlerts } from "@/hooks/useTransport";
import type { LinesByMode, LineByMode } from "@/hooks/useTransport";
import { useAuth } from "@/contexts/AuthContext";
import {
  getFavorites,
  addFavoriteLine,
  removeFavorite,
  type FavoriteJourney,
} from "@/services/favorites";
import { alertMatchesLine } from "@/lib/alerts";

const MODE_TABS = [
  { key: "metro" as const, label: "Métro", emoji: "🚇" },
  { key: "rer" as const, label: "RER", emoji: "🚉" },
  { key: "tram" as const, label: "Tram", emoji: "🚊" },
  { key: "transilien" as const, label: "Transilien", emoji: "🚆" },
];

type View = "dashboard" | "explorer";

function modeIcon(mode: string) {
  const m = mode.toLowerCase();
  if (m.includes("rer") || m.includes("transilien") || m.includes("train"))
    return <UrbanFlowIcon type="transport" name="train" size={14} />;
  if (m.includes("bus")) return <UrbanFlowIcon type="transport" name="bus" size={14} />;
  if (m.includes("metro") || m.includes("métro")) return <UrbanFlowIcon type="transport" name="train" size={14} />;
  return <UrbanFlowIcon type="action" name="locate" size={14} />;
}

function lineModeLabel(mode: string) {
  const m = mode.toLowerCase();
  if (m.includes("metro") || m.includes("métro")) return "Métro";
  if (m.includes("rer")) return "RER";
  if (m.includes("tram")) return "Tramway";
  if (m.includes("transilien") || m.includes("train")) return "Train";
  if (m.includes("bus")) return "Bus";
  return mode;
}

function normalizeHex(c?: string): string {
  if (!c) return "#2E7D9B";
  if (c.startsWith("#")) return c;
  return `#${c}`;
}

function findLineById(
  linesByMode: LinesByMode,
  lineId?: string,
): LineByMode | undefined {
  if (!lineId) return undefined;
  for (const key of Object.keys(linesByMode) as Array<keyof LinesByMode>) {
    const found = linesByMode[key].find((l) => l.id === lineId);
    if (found) return found;
  }
  return undefined;
}

function FavoriteLineCard({
  fav,
  networkLine,
  alerts,
  onToggle,
}: {
  fav: FavoriteJourney;
  networkLine?: LineByMode;
  alerts: import("@/services/api").RealtimeAlert[];
  onToggle: () => void;
}) {
  const lineName = fav.mode || networkLine?.shortName || "Ligne";
  const lineColor = normalizeHex(fav.modeColor || networkLine?.color);
  const lineId = fav.lineId || networkLine?.id;
  const lineAlerts = useMemo(
    () =>
      lineId
        ? alerts.filter((a) => alertMatchesLine(a, lineName, undefined, lineId))
        : alerts.filter((a) => alertMatchesLine(a, lineName, undefined, undefined)),
    [alerts, lineName, lineId],
  );
  const hasAlerts = lineAlerts.length > 0;
  const severe = lineAlerts.some((a) => a.severity === "severe");
  const warning = lineAlerts.some((a) => a.severity === "warning");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--card-radius)] border border-[var(--color-border)] bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm"
            style={{ backgroundColor: lineColor }}
          >
            {modeIcon(fav.mode || networkLine?.name || "")}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {lineName}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {lineModeLabel(fav.mode || networkLine?.name || "")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Retirer ${lineName} des favoris`}
          className="shrink-0 p-1.5 rounded-full text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)] transition-colors"
        >
          <UrbanFlowIcon type="navigation" name="favorites" size={16} className="fill-current" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        {networkLine ? (
          networkLine.status === "active" ? (
            <span className="inline-flex items-center gap-1 text-[var(--color-eco-green)]">
              <UrbanFlowIcon type="status" name="check" size={12} /> Trafic normal
            </span>
          ) : networkLine.status === "prochainement active" ? (
            <span className="inline-flex items-center gap-1 text-[var(--color-mobility-orange)]">
              <UrbanFlowIcon type="status" name="clock" size={12} /> Prochainement active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--color-text-tertiary)]">
              <UrbanFlowIcon type="status" name="info" size={12} /> {networkLine.status}
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 text-[var(--color-text-tertiary)]">
            <UrbanFlowIcon type="status" name="info" size={12} /> Hors réseau monitoré
          </span>
        )}
      </div>

      {hasAlerts ? (
        <div
          className={`mt-3 rounded-lg p-2.5 text-xs ${
            severe
              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
              : warning
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                : "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200"
          }`}
        >
          <div className="flex items-start gap-1.5">
            <UrbanFlowIcon type="status" name="alert" size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">
                {lineAlerts.length} perturbation{lineAlerts.length > 1 ? "s" : ""}
              </p>
              <ul className="mt-1 space-y-1">
                {lineAlerts.slice(0, 2).map((a) => (
                  <li key={a.id} className="line-clamp-2">
                    {a.headerText}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-[var(--color-text-tertiary)] inline-flex items-center gap-1">
          <UrbanFlowIcon type="status" name="check" size={12} className="text-[var(--color-eco-green)]" />
          Aucune alerte sur cette ligne
        </div>
      )}
    </motion.div>
  );
}

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
      {isActive && <UrbanFlowIcon type="status" name="check" size={12} className="text-[var(--color-eco-green)]" />}
      {isUpcoming && <UrbanFlowIcon type="status" name="info" size={12} className="text-[var(--color-mobility-orange)]" />}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        className="ml-0.5 p-0.5 rounded-full transition-colors"
      >
        <UrbanFlowIcon
          type="navigation"
          name="favorites"
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
  const { linesByMode, loading: linesLoading } = useLinesByMode();
  const { alerts, loading: alertsLoading } = useRealtimeAlerts();
  const [view, setView] = useState<View>("dashboard");
  const [favoriteLines, setFavoriteLines] = useState<FavoriteJourney[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<keyof LinesByMode>("metro");
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setFavoriteLines([]);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    setFavoritesLoading(true);
    getFavorites()
      .then((favs) => {
        setFavoriteLines(favs.filter((f) => f.type === "line"));
      })
      .finally(() => setFavoritesLoading(false));
  }, [isAuthenticated]);

  const favLineIds = useMemo(
    () => new Set(favoriteLines.map((f) => f.lineId).filter(Boolean) as string[]),
    [favoriteLines],
  );

  const handleToggleExplorer = async (
    line: LineByMode,
    mode: keyof LinesByMode,
  ) => {
    if (!isAuthenticated) {
      router.push("/login?redirect=/lines");
      return;
    }
    if (toggling.has(line.id)) return;
    setToggling((prev) => new Set(prev).add(line.id));
    try {
      if (favLineIds.has(line.id)) {
        const favId = favoriteLines.find((f) => f.lineId === line.id)?.id;
        if (favId) {
          await removeFavorite(favId);
          setFavoriteLines((prev) => prev.filter((f) => f.lineId !== line.id));
        }
      } else {
        const fav = await addFavoriteLine({
          lineId: line.id,
          lineName: line.shortName,
          mode,
          modeColor: `#${line.color}`,
        });
        setFavoriteLines((prev) => [...prev, { ...fav, type: "line" }]);
      }
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(line.id);
        return next;
      });
    }
  };

  const handleRemoveDashboard = async (fav: FavoriteJourney) => {
    if (!fav.id) return;
    try {
      await removeFavorite(fav.id);
      setFavoriteLines((prev) => prev.filter((f) => f.id !== fav.id));
    } catch (error) {
      console.error("Failed to remove favorite line:", error);
    }
  };

  const lines = linesByMode[activeTab] || [];
  const loading = linesLoading || alertsLoading || favoritesLoading;

  return (
    <AppShell title="Lignes" showBack rightAction={undefined}>
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex p-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setView("dashboard")}
            aria-pressed={view === "dashboard"}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              view === "dashboard"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Mes lignes
          </button>
          <button
            type="button"
            onClick={() => setView("explorer")}
            aria-pressed={view === "explorer"}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              view === "explorer"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Explorer
          </button>
        </div>
        {favoriteLines.length > 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {favoriteLines.length} ligne{favoriteLines.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {view === "dashboard" ? (
        loading ? (
          <div className="text-sm text-[var(--color-text-tertiary)] py-12 text-center">
            Chargement…
          </div>
        ) : favoriteLines.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Vous n&apos;avez pas encore de lignes favorites.
            </p>
            {!isAuthenticated ? (
              <button
                type="button"
                onClick={() => router.push("/login?redirect=/lines")}
                className="text-sm font-medium text-[var(--color-primary)]"
              >
                Se connecter pour sauvegarder des lignes
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setView("explorer")}
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)]"
              >
                Explorer les lignes
                <UrbanFlowIcon type="action" name="chevron-right" size={16} />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {favoriteLines.map((fav) => (
              <FavoriteLineCard
                key={fav.id}
                fav={fav}
                networkLine={findLineById(linesByMode, fav.lineId || undefined)}
                alerts={alerts}
                onToggle={() => handleRemoveDashboard(fav)}
              />
            ))}
          </div>
        )
      ) : linesLoading ? (
        <div className="text-sm text-[var(--color-text-tertiary)] py-8 text-center">
          Chargement des lignes…
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            État du trafic sur le réseau couvert par UrbanFlow.
          </p>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {MODE_TABS.map((tab) => {
              const count = (linesByMode[tab.key] || []).length;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={active}
                  aria-label={`${tab.label} — ${count} ligne${count > 1 ? "s" : ""}`}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                    active
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
                  isFavorite={favLineIds.has(line.id)}
                  onToggle={() => handleToggleExplorer(line, activeTab)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
