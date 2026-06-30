"use client";

import { useState, useEffect } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStyle,
  type NotificationItem,
} from "@/services/notifications";
import { useAuth } from "@/contexts/AuthContext";

export default function NotificationsPage() {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await getNotifications();
      if (!cancelled) {
        setNotifications(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  async function handleMarkAsRead(id: string) {
    const updated = await markAsRead(id);
    if (updated) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    }
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  async function handleDelete(id: string) {
    const deleted = await deleteNotification(id);
    if (deleted) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `Il y a ${diffD}j`;
    return date.toLocaleDateString("fr-FR");
  }

  return (
    <AppShell title="Notifications" showBack>
      {notifications.some((n) => !n.isRead) && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            aria-label="Marquer toutes les notifications comme lues"
          >
            <CheckCheck size={14} />
            Tout marquer lu
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell size={48} className="mx-auto text-[var(--color-text-tertiary)] mb-4" />
          <p className="text-[var(--color-text-secondary)]">
            Aucune notification pour le moment
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Les alertes de vos trajets favoris apparaîtront ici
          </p>
        </div>
      ) : (
        <div role="list" aria-label="Liste des notifications" className="space-y-2">
          {notifications.map((notif) => {
            const style = getNotificationStyle(notif.type);
            return (
              <div
                key={notif.id}
                role="listitem"
                className={`bg-[var(--color-surface)] rounded-[var(--card-radius)] border border-[var(--color-border)] p-4 transition-colors ${
                  !notif.isRead ? "border-l-4 border-l-blue-500" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0" aria-hidden="true">
                    {style.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        !notif.isRead
                          ? "font-semibold text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {notif.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                      {notif.message}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                      {formatDate(notif.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {!notif.isRead && (
                      <button
                        onClick={() => handleMarkAsRead(notif.id)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        aria-label={`Marquer "${notif.title}" comme lu`}
                      >
                        Lu
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(notif.id)}
                      className="text-xs text-red-500 hover:underline"
                      aria-label={`Supprimer "${notif.title}"`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}