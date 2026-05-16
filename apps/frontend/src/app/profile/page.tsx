"use client";

import { useState, useEffect } from "react";
import {
  User,
  Bell,
  ChevronRight,
  Leaf,
  Accessibility,
  Moon,
  LogOut,
  Trash2,
  Zap,
  Wallet,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import {
  getStats,
  getPreferences,
  savePreferences,
  clearHistory,
  type UserStats,
  type UserPreferences,
} from "@/services/favorites";

const modeOptions = [
  { key: "fast" as const, label: "Rapide", icon: <Zap size={14} /> },
  { key: "eco" as const, label: "Éco", icon: <Leaf size={14} /> },
  { key: "cheap" as const, label: "Économique", icon: <Wallet size={14} /> },
];

export default function ProfilePage() {
  const [stats, setStats] = useState<UserStats>({ totalTrips: 0, co2Saved: 0, favoriteCount: 0 });
  const [prefs, setPrefs] = useState<UserPreferences>({
    defaultMode: "fast",
    notifications: true,
    accessibility: false,
    darkMode: false,
  });

  useEffect(() => {
    setStats(getStats());
    setPrefs(getPreferences());
  }, []);

  const handleToggle = (key: keyof UserPreferences) => {
    const updated = savePreferences({ [key]: !prefs[key] });
    setPrefs(updated);
  };

  const handleModeChange = (mode: "fast" | "eco" | "cheap") => {
    const updated = savePreferences({ defaultMode: mode });
    setPrefs(updated);
  };

  const formatCo2 = (grams: number) => {
    if (grams >= 1000) return `${(grams / 1000).toFixed(1)}kg`;
    return `${grams}g`;
  };

  return (
    <AppShell title="Profil">
      {/* Avatar & Info */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-2xl font-bold mb-3">
          <User size={36} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Utilisateur
        </h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Mobilité multimodale Paris
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-eco-green)]/10 text-[var(--color-eco-green)]">
            <Leaf size={12} className="mr-1" />
            Éco-mobiliste
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-primary)]">{stats.totalTrips}</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Trajets</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-eco-green)]">{formatCo2(stats.co2Saved)}</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">CO₂ évité</p>
        </div>
        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-3 text-center">
          <p className="text-xl font-bold text-[var(--color-mobility-orange)]">{stats.favoriteCount}</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Favoris</p>
        </div>
      </div>

      {/* Default transport mode */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
          Mode de transport par défaut
        </h3>
        <div className="flex gap-2">
          {modeOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleModeChange(opt.key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 px-3 rounded-[var(--chip-radius)] text-sm font-medium transition-colors ${
                prefs.defaultMode === opt.key
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Menu */}
      <div className="bg-white rounded-[var(--card-radius)] border border-[var(--color-border)] overflow-hidden">
        <button
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface)] transition-colors text-left border-b border-[var(--color-border)]"
          onClick={() => handleToggle("notifications")}
        >
          <Bell size={18} className="text-[var(--color-text-tertiary)]" />
          <span className="flex-1 text-sm text-[var(--color-text-primary)]">
            Notifications
          </span>
          <div
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
              prefs.notifications ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                prefs.notifications ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        </button>

        <button
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface)] transition-colors text-left border-b border-[var(--color-border)]"
          onClick={() => handleToggle("accessibility")}
        >
          <Accessibility size={18} className="text-[var(--color-text-tertiary)]" />
          <span className="flex-1 text-sm text-[var(--color-text-primary)]">
            Accessibilité
          </span>
          <div
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
              prefs.accessibility ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                prefs.accessibility ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        </button>

        <button
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface)] transition-colors text-left"
          onClick={() => handleToggle("darkMode")}
        >
          <Moon size={18} className="text-[var(--color-text-tertiary)]" />
          <span className="flex-1 text-sm text-[var(--color-text-primary)]">
            Mode sombre
          </span>
          <div
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
              prefs.darkMode ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                prefs.darkMode ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        </button>
      </div>

      {/* Data management */}
      <div className="mt-4">
        <button
          onClick={() => {
            clearHistory();
            setStats(getStats());
          }}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)] transition-colors"
        >
          <Trash2 size={14} />
          Effacer l&apos;historique
        </button>
      </div>
    </AppShell>
  );
}
