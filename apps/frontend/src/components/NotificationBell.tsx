'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStyle,
  type NotificationItem,
} from '@/services/notifications';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch notifications on mount and when panel opens
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('urbanflow_authenticated') !== 'true') return;

    getUnreadCount().then(setUnreadCount);
  }, []);

  useEffect(() => {
    if (isOpen) {
      getNotifications().then(setNotifications);
      getUnreadCount().then(setUnreadCount);
    }
  }, [isOpen]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close panel on Escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  async function handleMarkAsRead(id: string) {
    const updated = await markAsRead(id);
    if (updated) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  async function handleDelete(id: string) {
    const deleted = await deleteNotification(id);
    if (deleted) {
      const notif = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (notif && !notif.isRead) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
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
    return date.toLocaleDateString('fr-FR');
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-gray-600 dark:text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center" role="status" aria-live="polite" aria-label={`${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-[1000]"
          role="dialog"
          aria-modal="true"
          aria-label="Panneau de notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Notifications
            </h2>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                aria-label="Marquer toutes les notifications comme lues"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Notification list */}
          <div role="list" aria-label="Liste des notifications">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Aucune notification
              </p>
            ) : (
              notifications.map((notif) => {
                const style = getNotificationStyle(notif.type);
                return (
                  <div
                    key={notif.id}
                    role="listitem"
                    className={`flex items-start gap-3 p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      !notif.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <span className="text-lg flex-shrink-0" aria-hidden="true">
                      {style.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          !notif.isRead
                            ? 'font-semibold text-gray-900 dark:text-gray-100'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {notif.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
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
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}