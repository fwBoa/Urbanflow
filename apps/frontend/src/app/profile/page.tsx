"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  Leaf,
  Accessibility,
  Moon,
  Sun,
  Trash2,
  Zap,
  Pencil,
  Check,
  Award,
  LogOut,
  LogIn,
  Download,
  Shield,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Switch from "@/components/Switch";
import {
  getStats,
  getPreferences,
  savePreferences,
  clearHistory,
  getBadges,
  type UserStats,
  type UserPreferences,
  type UserProfile,
  type Badge,
} from "@/services/favorites";
import { useAuth } from "@/contexts/AuthContext";
import { updateProfile as updateRemoteProfile } from "@/services/auth";
import { apiService } from "@/services/api";
import { useDarkMode } from "@/hooks/useDarkMode";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ─── Mapping mode de mobilité : UI (fast|eco) ↔ backend (rapide|eco|economique) ───
const MODE_UI_TO_BACKEND: Record<string, string> = {
  fast: "rapide",
  eco: "eco",
};
const MODE_BACKEND_TO_UI: Record<string, "fast" | "eco"> = {
  rapide: "fast",
  eco: "eco",
  economique: "fast", // fallback for legacy account data
};

const modeOptions = [
  { key: "fast" as const, label: "Rapide", icon: <Zap size={14} /> },
  { key: "eco" as const, label: "Éco", icon: <Leaf size={14} /> },
];

const avatarOptions = ["🚇", "🚲", "🚊", "🚈", "🚍", "🚶", "🌍", "⚡"];

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats>({ totalTrips: 0, co2Saved: 0, favoriteCount: 0 });
  const [prefs, setPrefs] = useState<UserPreferences>(() => getPreferences());
  const [profile, setProfile] = useState<UserProfile>({ name: "Utilisateur", email: "", avatar: "🚇" });
  const [badges, setBadges] = useState<Badge[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const { isDark, toggleDarkMode } = useDarkMode();
  const {
    supported: pushSupported,
    permission: pushPermission,
    subscribed: pushSubscribed,
    loading: pushLoading,
    subscribe: pushSubscribe,
    unsubscribe: pushUnsubscribe,
  } = usePushNotifications();

  const handlePushToggle = async () => {
    if (pushLoading) return;
    try {
      if (pushSubscribed) {
        await pushUnsubscribe();
      } else {
        await pushSubscribe();
      }
    } catch {
      // L'erreur est déjà stockée dans le hook ; on ne bloque pas l'UI.
    }
  };

  useEffect(() => {
    async function loadData() {
      const [s, b] = await Promise.all([getStats(), getBadges()]);
      setStats(s);
      setBadges(b);
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isAuthenticated && user) {
      // Use backend profile when authenticated
      setProfile({
        name: user.displayName || "Utilisateur",
        email: user.email,
        avatar: user.avatar || "🚇",
      });
      setPrefs((p) => ({
        ...p,
        defaultMode: MODE_BACKEND_TO_UI[user.preferredMode] ?? "fast",
        accessibility: user.accessibilityNeeds,
      }));
    } else {
      // Anonymous: default profile (no persistence)
      setProfile({ name: "Utilisateur", email: "", avatar: "🚇" });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    loadData();
  }, [isAuthenticated, user]);

  const handleToggle = (key: keyof UserPreferences) => {
    if (key === "darkMode") {
      toggleDarkMode();
      const updated = savePreferences({ darkMode: !isDark });
      setPrefs(updated);
      return;
    }
    const updated = savePreferences({ [key]: !prefs[key] });
    setPrefs(updated);
    // Sync accessibility needs to backend when authenticated
    if (key === "accessibility" && isAuthenticated) {
      updateRemoteProfile({ accessibilityNeeds: !prefs.accessibility }).catch(() => {
        /* non-critical */
      });
    }
    // Sync notifications preference to backend when authenticated
    if (key === "notifications" && isAuthenticated) {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
      fetch(`${API_URL}/api/auth/notifications-preference`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !prefs.notifications }),
      }).catch(() => { /* non-critical */ });
    }
  };

  const handleModeChange = (mode: "fast" | "eco") => {
    const updated = savePreferences({ defaultMode: mode });
    setPrefs(updated);
    // Persiste le mode côté backend (mapping UI → backend) quand authentifié
    if (isAuthenticated) {
      updateRemoteProfile({ preferredMode: MODE_UI_TO_BACKEND[mode] }).catch(() => {
        /* non-critical */
      });
    }
  };

  const handleSaveName = async () => {
    const newName = nameInput.trim() || "Utilisateur";
    if (isAuthenticated) {
      try {
        await updateRemoteProfile({ displayName: newName });
      } catch { /* non-critical */ }
    }
    setProfile((p) => ({ ...p, name: newName }));
    setEditingName(false);
  };

  const handleAvatarChange = async (avatar: string) => {
    if (isAuthenticated) {
      try {
        await updateRemoteProfile({ avatar });
      } catch { /* non-critical */ }
    }
    setProfile((p) => ({ ...p, avatar }));
    setShowAvatarPicker(false);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const formatCo2 = (grams: number) => {
    if (grams >= 1000) return `${(grams / 1000).toFixed(1)}kg`;
    return `${grams}g`;
  };

  // CO₂ equivalent: car emits ~120g/km, transit ~22g/km → saved = ~98g/km
  const co2EquivalentKm = stats.co2Saved > 0 ? Math.round(stats.co2Saved / 98) : 0;
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <AppShell title="Profil">
      {/* Avatar & Info */}
      <div className="flex flex-col items-center mb-6">
        {/* Avatar - editable only for authenticated users */}
        <div className="relative w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-3xl mb-3">
          {profile.avatar}
          {isAuthenticated && (
            <>
              <button
                onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-background border-2 border-[var(--color-primary)] flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                aria-label="Changer l'avatar"
              >
                <Pencil size={12} className="text-[var(--color-primary)]" />
              </button>
              {/* Avatar picker */}
              {showAvatarPicker && (
                <div className="absolute top-full mt-2 flex gap-2 flex-wrap justify-center bg-background rounded-xl shadow-lg p-2 border border-[var(--color-border)] z-10">
                  {avatarOptions.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleAvatarChange(emoji)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-all ${
                        profile.avatar === emoji
                          ? "bg-[var(--color-primary)] ring-2 ring-[var(--color-primary)]"
                          : "bg-[var(--color-surface)] hover:bg-[var(--color-border)]"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Name - editable only for authenticated users */}
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {profile.name}
          </h2>
          {isAuthenticated && (
            <>
              {editingName ? (
                <>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="text-lg font-semibold text-[var(--color-text-primary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 w-48 text-center"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  />
                  <button onClick={handleSaveName} className="text-[var(--color-eco-green)]">
                    <Check size={18} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setEditingName(true); setNameInput(profile.name); }}
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]"
                  aria-label="Modifier le nom"
                >
                  <Pencil size={14} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Email - read-only (always comes from auth) */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-tertiary)]">
            {profile.email || (isAuthenticated ? user?.email : "")}
          </span>
        </div>

        {/* Badges de statut */}
        <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
          {isAuthenticated ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <LogIn size={12} className="mr-1" />
              Connecté
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-text-tertiary)]/10 text-[var(--color-text-tertiary)]">
              Navigation locale
            </span>
          )}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-eco-green)]/10 text-[var(--color-eco-green)]">
            <Leaf size={12} className="mr-1" />
            Éco-mobiliste
          </span>
          {unlockedCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-mobility-orange)]/10 text-[var(--color-mobility-orange)]">
              <Award size={12} className="mr-1" />
              {unlockedCount}/{badges.length}
            </span>
          )}
        </div>

        {/* CTA for anonymous users */}
        {!isAuthenticated && (
          <div className="mt-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--card-radius)] p-3 text-center max-w-xs">
            <p className="text-xs text-[var(--color-text-secondary)] mb-2">
              Connectez-vous pour gérer votre profil, favoris et historique.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-lg text-xs font-semibold hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              <LogIn size={12} />
              Se connecter
            </button>
          </div>
        )}
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

      {/* CO₂ equivalent */}
      {co2EquivalentKm > 0 && (
        <div className="bg-[var(--color-eco-green)]/10 rounded-[var(--card-radius)] p-3 mb-4 border border-[var(--color-eco-green)]/20">
          <div className="flex items-center gap-2">
            <Leaf size={16} className="text-[var(--color-eco-green)]" />
            <p className="text-sm text-[var(--color-eco-green)]">
              <span className="font-semibold">{co2EquivalentKm} km</span> en voiture évités 🚗→🚇
            </p>
          </div>
        </div>
      )}

      {/* Badges */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-1">
          <Award size={16} />
          Badges
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {badges.map((badge) => (
            <div
              key={badge.key}
              className={`rounded-[var(--card-radius)] p-2.5 text-center transition-all ${
                badge.unlocked
                  ? "bg-[var(--color-surface)] border border-[var(--color-border)]"
                  : "bg-[var(--color-surface)]/50 border border-[var(--color-border)]/50 opacity-50"
              }`}
            >
              <span className="text-2xl block mb-1">{badge.unlocked ? badge.emoji : "🔒"}</span>
              <p className="text-[11px] font-medium text-[var(--color-text-primary)]">{badge.label}</p>
              <p className="text-[9px] text-[var(--color-text-tertiary)]">{badge.description}</p>
            </div>
          ))}
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

      {/* Settings */}
      <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] border border-[var(--color-border)] overflow-hidden">
        <div className="border-b border-[var(--color-border)]">
          <Switch
            checked={prefs.notifications}
            onChange={() => handleToggle("notifications")}
            icon={<Bell size={18} />}
          >
            Notifications
            <span className="block text-xs text-[var(--color-text-tertiary)] font-normal">
              Alertes perturbations et rappels
            </span>
          </Switch>
        </div>

        <div className="border-b border-[var(--color-border)] px-4 py-3 flex items-center gap-3">
          <span className="text-[var(--color-text-tertiary)]" aria-hidden="true">
            <Bell size={18} />
          </span>
          <div className="flex-1">
            <p className="text-sm text-[var(--color-text-primary)]">Notifications push</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {pushPermission === "denied"
                ? "Bloqué dans les paramètres du navigateur"
                : !pushSupported
                  ? "Non supporté sur cet appareil"
                  : pushSubscribed
                    ? "Activées"
                    : "Désactivées"}
            </p>
          </div>
          <button
            type="button"
            disabled={
              pushLoading || !pushSupported || pushPermission === "denied"
            }
            onClick={handlePushToggle}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]"
          >
            {pushLoading
              ? "..."
              : pushSubscribed
                ? "Désactiver"
                : "Activer"}
          </button>
        </div>

        <div className="border-b border-[var(--color-border)]">
          <Switch
            checked={prefs.accessibility}
            onChange={() => handleToggle("accessibility")}
            icon={<Accessibility size={18} />}
          >
            Accessibilité
            <span className="block text-xs text-[var(--color-text-tertiary)] font-normal">
              Réduit les animations et augmente le contraste
            </span>
          </Switch>
        </div>

        <Switch
          checked={isDark}
          onChange={() => handleToggle("darkMode")}
          icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
        >
          {isDark ? "Mode clair" : "Mode sombre"}
        </Switch>
      </div>

      {/* Auth section */}
      <div className="mt-4 space-y-2">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)] transition-colors"
          >
            <LogOut size={14} />
            Se déconnecter
          </button>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--card-radius)] bg-[var(--color-primary)] text-white font-semibold hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            <LogIn size={16} />
            Se connecter
          </button>
        )}
        <button
          onClick={async () => {
            await clearHistory();
            const s = await getStats();
            setStats(s);
            const b = await getBadges();
            setBadges(b);
          }}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)] transition-colors"
        >
          <Trash2 size={14} />
          Effacer l&apos;historique
        </button>

        {/* ─── RGPD: Droits des personnes (§9.3 Dossier Technique) ─── */}
        <div className="mt-6 pt-4 border-t border-[var(--color-border)] space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <Shield size={16} className="text-[var(--color-primary)]" />
            Données personnelles (RGPD)
          </h3>

          {isAuthenticated && (
            <>
              {/* Export data (Art. 20) */}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${apiService.getBaseUrl()}/api/auth/me/export`, {
                      credentials: "include",
                    });
                    if (!res.ok) throw new Error("Export failed");
                    const data = await res.json();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "urbanflow-data-export.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    alert("Erreur lors de l'export. Vérifiez votre connexion.");
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors rounded-[var(--card-radius)] border border-[var(--color-border)]"
              >
                <Download size={14} />
                Exporter mes données (JSON)
              </button>

              {/* Delete account (Art. 17) */}
              <button
                onClick={async () => {
                  if (!confirm("⚠️ Cette action supprimera votre compte. Vos données seront effacées sous 30 jours. Continuer ?")) return;
                  try {
                    const res = await fetch(`${apiService.getBaseUrl()}/api/auth/me`, {
                      method: "DELETE",
                      credentials: "include",
                    });
                    if (!res.ok) throw new Error("Delete failed");
                    logout();
                    router.push("/");
                  } catch {
                    alert("Erreur lors de la suppression. Réessayez.");
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors rounded-[var(--card-radius)] border border-red-200"
              >
                <AlertTriangle size={14} />
                Supprimer mon compte
              </button>
            </>
          )}

          {/* Legal links */}
          <div className="flex gap-3 justify-center pt-2">
            <a
              href="/privacy"
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] underline flex items-center gap-1"
            >
              <Shield size={12} />
              Confidentialité
            </a>
            <a
              href="/legal"
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] underline flex items-center gap-1"
            >
              <FileText size={12} />
              Mentions légales
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
