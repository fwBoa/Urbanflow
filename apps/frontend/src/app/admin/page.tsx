"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Route,
  Bell,
  Leaf,
  TrendingUp,
  RefreshCw,
  Trash2,
  Send,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Database,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { adminApi, type DashboardStats, type User, type GtfsStatus } from "@/services/admin";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [gtfsStatus, setGtfsStatus] = useState<GtfsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Broadcast notification state
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Check admin access
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "admin")) {
      router.push("/");
    }
  }, [isAuthenticated, user, authLoading, router]);

  // Load dashboard data
  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      loadDashboard();
    }
  }, [isAuthenticated, user]);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);
      const [dashboardStats, usersList, gtfs] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getUsers(),
        adminApi.getGtfsStatus(),
      ]);
      setStats(dashboardStats);
      setUsers(usersList);
      setGtfsStatus(gtfs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  async function handleReloadGtfs() {
    try {
      setLoading(true);
      const result = await adminApi.reloadGtfs();
      setSuccess(result.message);
      await loadDashboard();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec rechargement GTFS");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(id: string, email: string) {
    if (!confirm(`⚠️ Supprimer l'utilisateur ${email} ?`)) return;

    try {
      await adminApi.deleteUser(id);
      setSuccess("Utilisateur supprimé");
      setUsers(users.filter((u) => u.id !== id));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec suppression");
    }
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastTitle || !broadcastMessage) return;

    try {
      setSending(true);
      const result = await adminApi.broadcastNotification({
        title: broadcastTitle,
        message: broadcastMessage,
        type: "info",
      });
      setSuccess(`Notification envoyée à ${result.count} utilisateurs`);
      setBroadcastTitle("");
      setBroadcastMessage("");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec envoi notification");
    } finally {
      setSending(false);
    }
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return null;
  }

  if (loading && !stats) {
    return (
      <AppShell title="Administration">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-[var(--color-primary)]" size={32} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Administration">
      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-[var(--card-radius)] p-4 mb-4 flex items-center gap-3">
          <AlertTriangle className="text-red-600" size={20} />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-[var(--card-radius)] p-4 mb-4 flex items-center gap-3">
          <CheckCircle className="text-green-600" size={20} />
          <span className="text-green-800 text-sm">{success}</span>
        </div>
      )}

      {/* Dashboard Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-[var(--color-primary)]" size={20} />
              <span className="text-xs text-[var(--color-text-tertiary)]">Utilisateurs</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.totals.users}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              +{stats.activity.newUsersLast7Days} cette semaine
            </p>
          </div>

          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-2">
              <Route className="text-[var(--color-eco-green)]" size={20} />
              <span className="text-xs text-[var(--color-text-tertiary)]">Trajets</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.totals.trips}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              +{stats.activity.tripsLast7Days} cette semaine
            </p>
          </div>

          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-2">
              <Leaf className="text-[var(--color-eco-green)]" size={20} />
              <span className="text-xs text-[var(--color-text-tertiary)]">CO₂ économisé</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-eco-green)]">
              {stats.totals.co2SavedKg >= 1000
                ? `${(stats.totals.co2SavedKg / 1000).toFixed(1)}t`
                : `${Math.round(stats.totals.co2SavedKg)}kg`}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Total depuis le début</p>
          </div>

          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="text-[var(--color-mobility-orange)]" size={20} />
              <span className="text-xs text-[var(--color-text-tertiary)]">Notifications</span>
            </div>
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.totals.notifications}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Toutes les notifications</p>
          </div>
        </div>
      )}

      {/* Stats breakdown */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
              <TrendingUp size={16} />
              Utilisateurs par rôle
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.breakdown.usersByRole).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-secondary)] capitalize">{role}</span>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
              <Activity size={16} />
              Trajets par mode
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.breakdown.tripsByMode).map(([mode, count]) => (
                <div key={mode} className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-secondary)] capitalize">{mode}</span>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GTFS Status */}
      <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)] mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <Database size={16} />
            Données GTFS (PRIM Île-de-France Mobilités)
          </h3>
          <button
            onClick={handleReloadGtfs}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--chip-radius)] hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Recharger
          </button>
        </div>
        {gtfsStatus && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {gtfsStatus.loaded ? (
                <CheckCircle className="text-green-600" size={16} />
              ) : (
                <XCircle className="text-red-600" size={16} />
              )}
              <span className="text-sm text-[var(--color-text-secondary)]">
                {gtfsStatus.loaded ? "Chargées" : "Non chargées"}
              </span>
            </div>
            {gtfsStatus.lastLoadTime && (
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Dernier chargement : {new Date(gtfsStatus.lastLoadTime).toLocaleString("fr-FR")}
              </p>
            )}
            {gtfsStatus.stats && (
              <div className="flex gap-4 mt-2">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {gtfsStatus.stats.totalRoutes} lignes
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {gtfsStatus.stats.totalStops} arrêts
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {gtfsStatus.stats.totalTrips} trajets
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Broadcast Notification */}
      <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)] mb-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
          <Send size={16} />
          Notification globale
        </h3>
        <form onSubmit={handleBroadcast} className="space-y-3">
          <input
            type="text"
            value={broadcastTitle}
            onChange={(e) => setBroadcastTitle(e.target.value)}
            placeholder="Titre de la notification"
            className="w-full px-3 py-2 bg-white border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]"
          />
          <textarea
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder="Message à envoyer à tous les utilisateurs..."
            rows={3}
            className="w-full px-3 py-2 bg-white border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
          />
          <button
            type="submit"
            disabled={sending || !broadcastTitle || !broadcastMessage}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--color-primary)] text-white rounded-lg font-semibold hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
            {sending ? "Envoi en cours..." : "Envoyer à tous les utilisateurs"}
          </button>
        </form>
      </div>

      {/* Users List */}
      <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <Users size={16} />
            Utilisateurs ({users.length})
          </h3>
          <button
            onClick={loadDashboard}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[var(--color-border)] text-[var(--color-text-secondary)] rounded-[var(--chip-radius)] hover:bg-[var(--color-border)]/70"
          >
            <RefreshCw size={14} />
            Rafraîchir
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-tertiary)]">Email</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-tertiary)]">Rôle</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-tertiary)]">Inscrit le</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-tertiary)]">Dernière connexion</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-[var(--color-text-tertiary)]">Statut</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-[var(--color-text-tertiary)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-border)]/20">
                  <td className="py-2 px-3 text-sm text-[var(--color-text-primary)]">{u.email}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-[var(--color-text-tertiary)]">
                    {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-2 px-3 text-xs text-[var(--color-text-tertiary)]">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("fr-FR") : "—"}
                  </td>
                  <td className="py-2 px-3">
                    {u.deletedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600">
                        <XCircle size={12} />
                        Supprimé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle size={12} />
                        Actif
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {!u.deletedAt && u.id !== user.id && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="text-red-600 hover:text-red-700 p-1"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
