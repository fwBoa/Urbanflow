"use client";

import { useState, useEffect, Suspense } from "react";
import { AlertTriangle, AlertOctagon, Info, Loader2, CheckCircle2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { apiService } from "@/services/api";
import type { RealtimeAlert } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";

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
  const [alerts, setAlerts] = useState<RealtimeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "severe" | "warning" | "info">("all");

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

  const filteredAlerts = alerts.filter((a) =>
    filter === "all" ? true : a.severity === filter,
  );

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
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)]">
        {filteredAlerts.length} perturbation{filteredAlerts.length > 1 ? "s" : ""} affichée
        {filteredAlerts.length > 1 ? "s" : ""}
      </p>

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
