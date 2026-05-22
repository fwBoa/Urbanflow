"use client";

import { useState, useEffect } from "react";
import {
  User,
  Bell,
  Leaf,
  Accessibility,
  Moon,
  Sun,
  Trash2,
  Zap,
  Wallet,
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
import { useDarkMode } from "@/hooks/useDarkMode";

const modeOptions = [
  { key: "fast" as const, label: "Rapide", icon: <Zap size={14} /> },
  { key: "eco" as const, label: "Éco", icon: <Leaf size={14} /> },
  { key: "cheap" as const, label: "Économique", icon: <Wallet size={14} /> },
];

const avatarOptions = ["🚇", "🚲", "🚊", "🚈", "🚍", "🚶", "🌍", "⚡"];

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats>({ totalTrips: 0, co2Saved: 0, favoriteCount: 0 });
  const [prefs, setPrefs] = useState<UserPreferences>({
    defaultMode: "fast",
    notifications: true,
    accessibility: false,
    darkMode: false,
  });
  const [profile, setProfile] = useState<UserProfile>({ name: "Utilisateur", email: "", avatar: "🚇" });
  const [badges, setBadges] = useState<Badge[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const { isDark, toggleDarkMode } = useDarkMode();

  useEffect(() => {
    async function loadData() {
      const [s, b] = await Promise.all([getStats(), getBadges()]);
      setStats(s);
      setBadges(b);
    }
    setPrefs(getPreferences());
    if (isAuthenticated && user) {
      // Use backend profile when authenticated
      setProfile({
        name: user.displayName || "Utilisateur",
        email: user.email,
        avatar: user.avatar || "🚇",
      });
      setPrefs((p) => ({
        ...p,
        defaultMode: user.preferredMode === "economique" ? "cheap" : (user.preferredMode as "fast" | "eco" | "cheap"),
        accessibility: user.accessibilityNeeds,
      }));
    } else {
      // Anonymous: default profile (no persistence)
      setProfile({ name: "Utilisateur", email: "", avatar: "🚇" });
    }
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
    // Sync notifications preference to backend when authenticated
    if (key === "notifications" && isAuthenticated) {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      fetch(`${API_URL}/api/auth/notifications-preference`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !prefs.notifications }),
      }).catch(() => { /* non-critical */ });
    }
  };

  const handleModeChange = (mode: "fast" | "eco" | "cheap") => {
    const updated = savePreferences({ defaultMode: mode });
    setPrefs(updated);
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

  const handleSaveEmail = async () => {
    // Email is read-only (always comes from auth)
    setEditingEmail(false);
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
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border-2 border-[var(--color-primary)] flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                aria-label="Changer l'avatar"
              >
                <Pencil size={12} className="text-[var(--color-primary)]" />
              </button>
              {/* Avatar picker */}
              {showAvatarPicker && (
                <div className="absolute top-full mt-2 flex gap-2 flex-wrap justify-center bg-white rounded-xl shadow-lg p-2 border border-[var(--color-border)] z-10">
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
        <button
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-border)]/50 transition-colors text-left border-b border-[var(--color-border)]"
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
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-border)]/50 transition-colors text-left border-b border-[var(--color-border)]"
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
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-border)]/50 transition-colors text-left"
          onClick={() => handleToggle("darkMode")}
        >
          {isDark ? <Sun size={18} className="text-[var(--color-text-tertiary)]" /> : <Moon size={18} className="text-[var(--color-text-tertiary)]" />}
          <span className="flex-1 text-sm text-[var(--color-text-primary)]">
            {isDark ? "Mode clair" : "Mode sombre"}
          </span>
          <div
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
              isDark ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                isDark ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        </button>
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
                    const res = await fetch("/api/auth/me/export", {
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
                    const res = await fetch("/api/auth/me", {
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
