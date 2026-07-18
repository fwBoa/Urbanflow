/**
 * Notification service — frontend API calls
 * Connects to backend /api/notifications endpoints
 */

// "" in prod → relative "/api/..." via nginx; set in .env for dev cross-port.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface NotificationItem {
  id: string;
  type: 'disruption' | 'delay' | 'info' | 'favorite_alert' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  relatedLine: string | null;
  relatedStop: string | null;
  actionUrl: string | null;
  createdAt: string;
}

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  return headers;
}

/** Get all notifications for current user */
export async function getNotifications(): Promise<NotificationItem[]> {
  const res = await fetch(`${API_URL}/api/notifications`, {
    credentials: 'include',
    headers: getHeaders(),
  });
  if (res.status === 401) return [];
  if (!res.ok) return [];
  return res.json();
}

/** Get unread notification count */
export async function getUnreadCount(): Promise<number> {
  const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
    credentials: 'include',
    headers: getHeaders(),
  });
  if (res.status === 401) return 0;
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
}

/** Mark a notification as read */
export async function markAsRead(id: string): Promise<NotificationItem | null> {
  const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
    method: 'PATCH',
    credentials: 'include',
    headers: getHeaders(),
  });
  if (res.status === 401) return null;
  if (!res.ok) return null;
  return res.json();
}

/** Mark all notifications as read */
export async function markAllAsRead(): Promise<void> {
  await fetch(`${API_URL}/api/notifications/mark-all-read`, {
    method: 'POST',
    credentials: 'include',
    headers: getHeaders(),
  });
}

/** Delete a notification */
export async function deleteNotification(id: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/notifications/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getHeaders(),
  });
  if (res.status === 401) return false;
  if (!res.ok) return false;
  const data = await res.json();
  return data.deleted ?? false;
}

/** Delete all notifications (RGPD) */
export async function deleteAllNotifications(): Promise<void> {
  await fetch(`${API_URL}/api/notifications`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getHeaders(),
  });
}

/** Type icon and color mapping */
export function getNotificationStyle(type: NotificationItem['type']): { icon: string; color: string } {
  switch (type) {
    case 'disruption':
      return { icon: '⚠️', color: 'text-red-500' };
    case 'delay':
      return { icon: '⏱️', color: 'text-orange-500' };
    case 'favorite_alert':
      return { icon: '⭐', color: 'text-yellow-500' };
    case 'system':
      return { icon: '🔔', color: 'text-blue-500' };
    case 'info':
    default:
      return { icon: 'ℹ️', color: 'text-gray-500' };
  }
}