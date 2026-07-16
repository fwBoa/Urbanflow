import { apiService } from "./api";

// ─── Types ──────────────────────────────────────────────────────────

export interface FavoriteJourney {
  id: string;
  from: string;
  to: string;
  mode: string;
  modeColor: string;
  duration: string;
  co2: number;
  origin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
  createdAt: string;
}

export interface HistoryJourney {
  id: string;
  from: string;
  to: string;
  mode: string;
  modeColor: string;
  duration: string;
  co2: number;
  date: string;
  origin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
}

export interface UserStats {
  totalTrips: number;
  co2Saved: number;
  favoriteCount: number;
}

export interface UserPreferences {
  defaultMode: "fast" | "eco";
  notifications: boolean;
  accessibility: boolean;
  darkMode: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
}

export interface Badge {
  key: string;
  label: string;
  emoji: string;
  description: string;
  unlocked: boolean;
}

// ─── Storage keys ─────────────────────────────────────────────────

// Anonymous users have NO persistence (favorites/history/profile)
// Only preferences (UI settings) are stored in localStorage
const PREFS_KEY = "urbanflow_prefs";

// ─── Auth check: use backend API when logged in ──────────────────

function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem("urbanflow_authenticated") === "true";
}

const API = () => apiService.getBaseUrl();

// ─── Favorites ────────────────────────────────────────────────────

export async function getFavorites(): Promise<FavoriteJourney[]> {
  if (isLoggedIn()) {
    try {
      const res = await fetch(`${API()}/api/favorites`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      return data.map((f: Record<string, unknown>) => ({
        id: f.id as string,
        from: f.from as string,
        to: f.to as string,
        mode: f.mode as string,
        modeColor: f.modeColor as string,
        duration: f.duration as string,
        co2: Number(f.co2),
        origin: f.originLat != null ? { lat: Number(f.originLat), lon: Number(f.originLon) } : undefined,
        destination: f.destLat != null ? { lat: Number(f.destLat), lon: Number(f.destLon) } : undefined,
        createdAt: f.createdAt as string,
      }));
    } catch (error) {
      console.error("Failed to fetch favorites from backend:", error);
      return [];
    }
  }
  // Anonymous users have NO favorites - return empty array
  return [];
}

export async function addFavorite(journey: {
  from: string;
  to: string;
  mode: string;
  modeColor: string;
  duration: string;
  co2: number;
  origin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
}): Promise<FavoriteJourney> {
  if (!isLoggedIn()) {
    // Anonymous users cannot add favorites - throw error to trigger login redirect
    throw new Error("Authentication required");
  }
  try {
    const res = await fetch(`${API()}/api/favorites`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: journey.from,
        to: journey.to,
        mode: journey.mode,
        modeColor: journey.modeColor,
        duration: journey.duration,
        co2: journey.co2,
        originLat: journey.origin?.lat,
        originLon: journey.origin?.lon,
        destLat: journey.destination?.lat,
        destLon: journey.destination?.lon,
      }),
    });
    if (!res.ok) throw new Error("Failed");
    const f = await res.json();
    return {
      id: f.id,
      from: f.from,
      to: f.to,
      mode: f.mode,
      modeColor: f.modeColor,
      duration: f.duration,
      co2: Number(f.co2),
      origin: f.originLat != null ? { lat: Number(f.originLat), lon: Number(f.originLon) } : undefined,
      destination: f.destLat != null ? { lat: Number(f.destLat), lon: Number(f.destLon) } : undefined,
      createdAt: f.createdAt,
    };
  } catch (error) {
    console.error("Failed to add favorite:", error);
    throw error;
  }
}

export async function removeFavorite(id: string): Promise<FavoriteJourney[]> {
  if (!isLoggedIn()) {
    throw new Error("Authentication required");
  }
  try {
    const res = await fetch(`${API()}/api/favorites/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed");
    return getFavorites();
  } catch (error) {
    console.error("Failed to remove favorite:", error);
    throw error;
  }
}

export async function isFavorite(from: string, to: string, mode: string): Promise<boolean> {
  const favorites = await getFavorites();
  return favorites.some((f) => f.from === from && f.to === to && f.mode === mode);
}

// ─── History ──────────────────────────────────────────────────────

export async function getHistory(): Promise<HistoryJourney[]> {
  if (isLoggedIn()) {
    try {
      const res = await fetch(`${API()}/api/favorites/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      return data.map((h: Record<string, unknown>) => ({
        id: h.id as string,
        from: h.from as string,
        to: h.to as string,
        mode: h.mode as string,
        modeColor: h.modeColor as string,
        duration: h.duration as string,
        co2: Number(h.co2),
        date: h.tripDate as string,
        origin: h.originLat != null ? { lat: Number(h.originLat), lon: Number(h.originLon) } : undefined,
        destination: h.destLat != null ? { lat: Number(h.destLat), lon: Number(h.destLon) } : undefined,
      }));
    } catch (error) {
      console.error("Failed to fetch history from backend:", error);
      return [];
    }
  }
  // Anonymous users have NO history - return empty array
  return [];
}

export async function addToHistory(journey: {
  from: string;
  to: string;
  mode: string;
  modeColor: string;
  duration: string;
  co2: number;
  origin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
}): Promise<HistoryJourney[]> {
  if (!isLoggedIn()) {
    // Anonymous users have NO history - silently ignore
    return [];
  }
  try {
    await fetch(`${API()}/api/favorites/history`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: journey.from,
        to: journey.to,
        mode: journey.mode,
        modeColor: journey.modeColor,
        duration: journey.duration,
        co2: journey.co2,
        originLat: journey.origin?.lat,
        originLon: journey.origin?.lon,
        destLat: journey.destination?.lat,
        destLon: journey.destination?.lon,
      }),
    });
    return getHistory();
  } catch (error) {
    console.error("Failed to add to history:", error);
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  if (!isLoggedIn()) {
    // Anonymous users have NO history - nothing to clear
    return;
  }
  try {
    await fetch(`${API()}/api/favorites/history`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch (error) {
    console.error("Failed to clear history:", error);
  }
}

// ─── Stats ────────────────────────────────────────────────────────

export async function getStats(): Promise<UserStats> {
  if (isLoggedIn()) {
    try {
      const res = await fetch(`${API()}/api/favorites/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    } catch (error) {
      console.error("Failed to fetch stats from backend:", error);
    }
  }
  // Anonymous users have NO stats - return zeros
  return { totalTrips: 0, co2Saved: 0, favoriteCount: 0 };
}

export async function incrementTrips(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _co2: number,
): Promise<UserStats> {
  // Stats are computed server-side when logged in
  return getStats();
}

// ─── Preferences (still localStorage — user preference, not GDPR data) ───

export function getPreferences(): UserPreferences {
  if (typeof window === "undefined") {
    return { defaultMode: "fast", notifications: true, accessibility: false, darkMode: false };
  }
  try {
    const data = localStorage.getItem(PREFS_KEY);
    return data
      ? JSON.parse(data)
      : { defaultMode: "fast", notifications: true, accessibility: false, darkMode: false };
  } catch {
    return { defaultMode: "fast", notifications: true, accessibility: false, darkMode: false };
  }
}

export function savePreferences(prefs: Partial<UserPreferences>): UserPreferences {
  const current = getPreferences();
  const updated = { ...current, ...prefs };
  localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
  return updated;
}

// ─── User Profile ─────────────────────────────────────────────────

// Anonymous users have NO profile persistence
// Profile is managed by AuthContext when logged in

// ─── Badges ──────────────────────────────────────────────────────────

export async function getBadges(): Promise<Badge[]> {
  const stats = await getStats();
  const favorites = await getFavorites();

  return [
    {
      key: "first_trip",
      label: "Premier trajet",
      emoji: "🎉",
      description: "Effectuez votre premier trajet",
      unlocked: stats.totalTrips >= 1,
    },
    {
      key: "eco_warrior",
      label: "Éco-guerrier",
      emoji: "🌿",
      description: "Économisez plus de 500g de CO₂",
      unlocked: stats.co2Saved >= 500,
    },
    {
      key: "explorer",
      label: "Explorateur",
      emoji: "🗺️",
      description: "Effectuez 10 trajets",
      unlocked: stats.totalTrips >= 10,
    },
    {
      key: "regular",
      label: "Régulier",
      emoji: "🚇",
      description: "Effectuez 25 trajets",
      unlocked: stats.totalTrips >= 25,
    },
    {
      key: "velib_fan",
      label: "Vélib' fan",
      emoji: "🚲",
      description: "Ajoutez 3 favoris",
      unlocked: favorites.length >= 3,
    },
    {
      key: "carbon_neutral",
      label: "Carbone neutre",
      emoji: "🌍",
      description: "Économisez plus de 5kg de CO₂",
      unlocked: stats.co2Saved >= 5000,
    },
  ];
}

// Anonymous users have zero data persistence - no local helpers needed