"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { AlertTriangle, AlertOctagon, Info, Loader2, CheckCircle2, Search, X, Heart } from "lucide-react";
import AppShell from "@/components/AppShell";
import { apiService } from "@/services/api";
import type { RealtimeAlert } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { getFavorites, type FavoriteJourney } from "@/services/favorites";
import { alertMatchesLine } from "@/lib/alerts";

function alertMatchesAnyFavorite(
  alert: RealtimeAlert,
  favoriteLines: { mode: string; lineId?: string }[],
): boolean {
  return favoriteLines.some((fav) =>
    alertMatchesLine(alert, fav.mode, undefined, fav.lineId || undefined),
  );
}

const severityConfig = {
  severe: {
    label: "Critique",
    icon: AlertOctagon,
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800/50",
    text: "text-red-800 dark:text-red-200",
    badge: "bg-red-600 text-white",
  },
  warning: {
    label: "Important",
    icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800/50",
    text: "text-amber-800 dark:text-amber-200",
    badge: "bg-amber-600 text-white",
  },
  info: {
    label: "Information",
    icon: Info,
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800/50",
    text: "text-blue-800 dark:text-blue-200",
    badge: "bg-blue-600 text-white",
  },
  unknown: {
    label: "Information",
    icon: Info,
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
    return alerts.filter((a) => {
      const matchesSeverity = filter === "all" || a.severity === filter;
      if (!matchesSeverity) return false;
      if (myLinesOnly) {
        if (!alertMatchesAnyFavorite(a, favoriteLines)) return false;
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
  }, [alerts, filter, myLinesOnly, favoriteLines, normalizedQuery]);

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
          <CheckCircle2 className="text-[var(--color-eco-green)]" size={32} />
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
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
          aria-hidden="true"
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
            <X size={14} />
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
          <Heart size={12} fill={myLinesOnly ? "currentColor" : "none"} />
          Mes lignes
        </button>
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
          const Icon = config.icon;
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
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.badge}`}>
                      {config.label}
                    </span>
                    {alert.affectedRoutes.length > 0 && (
                      <span className="text-[11px] text-[var(--color-text-tertiary)] truncate">
                        {alert.affectedRoutes.join(", ")}
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
