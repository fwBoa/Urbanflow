"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";
import ModeBadge from "@/components/ModeBadge";
import { apiService } from "@/services/api";
import type { RealtimeAlert, AffectedLine } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getFavorites, type FavoriteJourney } from "@/services/favorites";
import { alertMatchesLine } from "@/lib/alerts";
import { normalizeHexColor } from "@/lib/colors";

function alertMatchesAnyFavorite(
  alert: RealtimeAlert,
  favoriteLines: { mode: string; lineId?: string }[],
): boolean {
  return favoriteLines.some((fav) =>
    alertMatchesLine(alert, fav.mode, undefined, fav.lineId || undefined),
  );
}

// ─── C6 : pastilles de lignes structurées ──────────────────────────────
// Le backend expose affectedLines (nom + mode + code). On replie sur une
// dérivation locale depuis affectedRoutes pour les alertes qui n'ont pas
// encore le champ (repli GTFS-RT, cache stale…).

/** Ordre de tri métier : sévérité d'abord, puis mode (métro > RER > …). */
const SEVERITY_ORDER: Record<RealtimeAlert["severity"], number> = {
  severe: 0,
  warning: 1,
  info: 2,
  unknown: 3,
};

const MODE_ORDER: Record<AffectedLine["mode"], number> = {
  metro: 0,
  rer: 1,
  transilien: 2,
  tram: 3,
  bus: 4,
  autre: 5,
};

function detectModeFromName(name: string): AffectedLine["mode"] {
  const n = name.toUpperCase();
  if (n.includes("METRO") || n.includes("MÉTRO")) return "metro";
  if (n.includes("RER")) return "rer";
  if (n.includes("TRAM")) return "tram";
  if (n.includes("BUS")) return "bus";
  if (n.includes("TRANSILIEN") || n.includes("TRAIN")) return "transilien";
  return "autre";
}

/** Lignes d'affichage d'une alerte : affectedLines (backend) ou dérivation locale. */
function linesOf(alert: RealtimeAlert): AffectedLine[] {
  if (alert.affectedLines && alert.affectedLines.length > 0) return alert.affectedLines;
  const seen = new Set<string>();
  const result: AffectedLine[] = [];
  for (const route of alert.affectedRoutes) {
    const name = route.trim();
    if (!name) continue;
    const key = name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const tokens = key.split(" ").filter(Boolean);
    result.push({
      name,
      mode: detectModeFromName(name),
      code: tokens[tokens.length - 1] ?? "",
      lineId: alert.lineId,
    });
  }
  return result;
}

const severityConfig = {
  severe: {
    label: "Critique",
    icon: { type: "status" as const, name: "alert" },
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800/50",
    text: "text-red-800 dark:text-red-200",
    badge: "bg-red-600 text-white",
  },
  warning: {
    label: "Important",
    icon: { type: "status" as const, name: "alert" },
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800/50",
    text: "text-amber-800 dark:text-amber-200",
    badge: "bg-amber-600 text-white",
  },
  info: {
    label: "Information",
    icon: { type: "status" as const, name: "info" },
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800/50",
    text: "text-blue-800 dark:text-blue-200",
    badge: "bg-blue-600 text-white",
  },
  unknown: {
    label: "Information",
    icon: { type: "status" as const, name: "info" },
    bg: "bg-slate-50 dark:bg-slate-800/50",
    border: "border-slate-200 dark:border-slate-700",
    text: "text-slate-800 dark:text-slate-200",
    badge: "bg-slate-500 text-white",
  },
};

function AlertsPageContent() {
  const { isAuthenticated } = useAuth();
  const [alerts, setAlerts] = useState<RealtimeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "severe" | "warning" | "info">("all");
  const [modeFilter, setModeFilter] = useState<"all" | AffectedLine["mode"]>("all");
  const [query, setQuery] = useState("");
  const [myLinesOnly, setMyLinesOnly] = useState(false);
  const [favoriteLines, setFavoriteLines] = useState<FavoriteJourney[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    apiService
      .getRealtimeAlerts(controller.signal)
      .then((data) => {
        setAlerts(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError("Impossible de charger les alertes temps réel.");
        console.warn(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !myLinesOnly) return;
    let cancelled = false;
    getFavorites()
      .then((favs) => {
        if (cancelled) return;
        setFavoriteLines(favs.filter((f) => f.type === "line"));
      })
      .catch(() => {
        if (cancelled) setFavoriteLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, myLinesOnly]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAlerts = useMemo(() => {
    const filtered = alerts.filter((a) => {
      const matchesSeverity = filter === "all" || a.severity === filter;
      if (!matchesSeverity) return false;
      if (myLinesOnly) {
        if (!alertMatchesAnyFavorite(a, favoriteLines)) return false;
      }
      // C6 : filtre par mode (les alertes sans ligne identifiée restent
      // visibles uniquement en mode "all").
      if (modeFilter !== "all") {
        const modes = linesOf(a).map((l) => l.mode);
        if (!modes.includes(modeFilter)) return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        a.headerText,
        a.descriptionText,
        a.affectedRoutes.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    // C6 : tri métier — sévérité (severe → warning → info), puis mode
    // (métro → RER → transilien → tram → bus), pour scanner visuellement.
    return filtered.sort((a, b) => {
      const sevDiff =
        (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      const aModes = linesOf(a).map((l) => MODE_ORDER[l.mode] ?? 5);
      const bModes = linesOf(b).map((l) => MODE_ORDER[l.mode] ?? 5);
      return Math.min(...aModes, 5) - Math.min(...bModes, 5);
    });
  }, [alerts, filter, modeFilter, myLinesOnly, favoriteLines, normalizedQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-secondary)]">
        <Loader2 className="animate-spin text-[var(--color-primary)] mb-3" size={32} />
        <p className="text-sm">Chargement des perturbations…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-[var(--card-radius)] p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-secondary)] text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--color-eco-green)]/10 flex items-center justify-center mb-4">
          <UrbanFlowIcon type="status" name="check" className="text-[var(--color-eco-green)]" size={32} />
        </div>
        <p className="text-base font-semibold text-[var(--color-text-primary)]">
          Aucune perturbation signalée
        </p>
        <p className="text-sm mt-1 max-w-[260px]">
          Le trafic est normal sur le réseau couvert par Urban Flow.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Recherche */}
      <div className="relative">
        <UrbanFlowIcon
          type="navigation"
          name="search"
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une ligne, un arrêt, une perturbation…"
          className="w-full pl-9 pr-9 py-2 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            aria-label="Effacer la recherche"
          >
            <UrbanFlowIcon type="action" name="close" size={14} />
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrer par sévérité">
        {[
          { key: "all", label: "Toutes" },
          { key: "severe", label: "Critiques" },
          { key: "warning", label: "Importantes" },
          { key: "info", label: "Infos" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as typeof filter)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMyLinesOnly((v) => !v)}
          aria-pressed={myLinesOnly}
          className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            myLinesOnly
              ? "bg-[var(--color-favorite-red)] text-white"
              : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
          }`}
        >
          <UrbanFlowIcon
            type="navigation"
            name={myLinesOnly ? "favorites-filled" : "favorites"}
            size={12}
          />
          Mes lignes
        </button>
      </div>

      {/* Filtre par mode de transport (C6) */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrer par mode de transport">
        {(
          [
            { key: "all", label: "Tous modes" },
            { key: "metro", label: "Métro" },
            { key: "rer", label: "RER" },
            { key: "transilien", label: "Transilien" },
            { key: "tram", label: "Tram" },
            { key: "bus", label: "Bus" },
          ] as Array<{ key: "all" | AffectedLine["mode"]; label: string }>
        ).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setModeFilter(m.key)}
            aria-pressed={modeFilter === m.key}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              modeFilter === m.key
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)]">
        {filteredAlerts.length} perturbation{filteredAlerts.length > 1 ? "s" : ""} affichée
        {filteredAlerts.length > 1 ? "s" : ""}
      </p>

      {filteredAlerts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {myLinesOnly && favoriteLines.length === 0
              ? "Vous n&apos;avez pas encore de lignes favorites."
              : "Aucune alerte ne correspond à votre recherche."}
          </p>
          <button
            onClick={() => {
              setQuery("");
              setFilter("all");
              setMyLinesOnly(false);
            }}
            className="mt-2 text-xs text-[var(--color-primary)] font-medium"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {filteredAlerts.map((alert) => {
          const config = severityConfig[alert.severity] || severityConfig.unknown;
          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className={`rounded-[var(--card-radius)] border p-4 ${config.bg} ${config.border}`}
            >
              <div className="flex items-start gap-3">
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.badge}`}>
                  <UrbanFlowIcon type={config.icon.type} name={config.icon.name} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.badge}`}>
                      {config.label}
                    </span>
                    {/* C6 : pastilles de lignes — mode + code + couleur IDFM,
                        identifiables en 1 seconde (remplace le texte gris) */}
                    {linesOf(alert).length > 0 && (
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        {linesOf(alert)
                          .slice(0, 4)
                          .map((line) => (
                            <ModeBadge
                              key={`${alert.id}-${line.name}`}
                              mode={line.mode}
                              lineName={line.code || line.name}
                              // Couleur officielle IDFM — normalisée (la source
                              // peut exposer la valeur avec ou sans « # »)
                              lineColor={line.color ? normalizeHexColor(line.color) : undefined}
                              size="sm"
                            />
                          ))}
                        {linesOf(alert).length > 4 && (
                          <span className="text-[11px] text-[var(--color-text-tertiary)]">
                            +{linesOf(alert).length - 4}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <h2 className={`text-sm font-semibold ${config.text}`}>
                    {alert.headerText}
                  </h2>
                  {alert.descriptionText && (
                    <p className={`text-xs mt-1 opacity-90 ${config.text}`}>
                      {alert.descriptionText}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default function AlertsPage() {
  return (
    <AppShell title="Perturbations">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="animate-spin text-[var(--color-primary)] mb-3" size={32} />
            <p className="text-sm text-[var(--color-text-secondary)]">Chargement…</p>
          </div>
        }
      >
        <AlertsPageContent />
      </Suspense>
    </AppShell>
  );
}
