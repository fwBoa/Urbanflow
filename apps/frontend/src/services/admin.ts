/**
 * Service API Admin — Appels aux endpoints administrateur
 */

export interface DashboardStats {
  totals: {
    users: number;
    trips: number;
    notifications: number;
    co2SavedKg: number;
  };
  breakdown: {
    usersByRole: Record<string, number>;
    tripsByMode: Record<string, number>;
  };
  activity: {
    newUsersLast7Days: number;
    tripsLast7Days: number;
  };
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: string;
  lastLoginAt: Date | null;
  consentGeoloc: boolean;
  consentHistory: boolean;
  deletedAt: Date | null;
  tripCount?: number;
  notifCount?: number;
}

export interface Trip {
  id: string;
  userId: string;
  from: string;
  to: string;
  mode: string;
  modeColor: string;
  duration: string;
  co2: number;
  tripDate: string;
  user?: User;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  relatedLine: string | null;
  createdAt: string;
}

export interface GtfsStatus {
  loaded: boolean;
  lastLoadTime: string | null;
  stats: {
    totalRoutes: number;
    totalStops: number;
    totalTrips: number;
  } | null;
}

// "" in prod → relative "/api/..." via nginx; set in .env for dev cross-port.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function fetchAdmin<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erreur serveur' }));
    throw new Error(error.message || `Erreur ${res.status}`);
  }

  return res.json();
}

async function postAdmin<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erreur serveur' }));
    throw new Error(error.message || `Erreur ${res.status}`);
  }

  return res.json();
}

async function deleteAdmin(endpoint: string): Promise<void> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erreur serveur' }));
    throw new Error(error.message || `Erreur ${res.status}`);
  }
}

export const adminApi = {
  // Dashboard
  getDashboard: () => fetchAdmin<DashboardStats>('/api/admin/dashboard'),

  // Users
  getUsers: () => fetchAdmin<User[]>('/api/admin/users'),
  getUserById: (id: string) => fetchAdmin<User>(`/api/admin/users/${id}`),
  deleteUser: (id: string) => deleteAdmin(`/api/admin/users/${id}`),

  // Trips
  getTrips: (limit = 50, offset = 0) =>
    fetchAdmin<{ data: Trip[]; total: number; limit: number; offset: number }>(
      `/api/admin/trips?limit=${limit}&offset=${offset}`,
    ),

  // Notifications
  getNotifications: () => fetchAdmin<Notification[]>('/api/admin/notifications'),
  broadcastNotification: (body: { title: string; message: string; type?: string; lineId?: string }) =>
    postAdmin<{ message: string; count: number }>('/api/admin/broadcast', body),

  // GTFS
  getGtfsStatus: () => fetchAdmin<GtfsStatus>('/api/admin/gtfs/status'),
  reloadGtfs: () => postAdmin<{ success: boolean; message: string }>('/api/admin/gtfs/reload', {}),
};
