import type { JourneyResult } from "@/services/api";

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
}

const FAVORITES_KEY = "urbanflow_favorites";
const HISTORY_KEY = "urbanflow_history";
const STATS_KEY = "urbanflow_stats";

const MAX_HISTORY = 20;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Favorites ────────────────────────────────────────────────────

export function getFavorites(): FavoriteJourney[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(FAVORITES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addFavorite(journey: {
  from: string;
  to: string;
  mode: string;
  modeColor: string;
  duration: string;
  co2: number;
  origin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
}): FavoriteJourney {
  const favorites = getFavorites();

  // Check for duplicate
  const isDuplicate = favorites.some(
    (f) => f.from === journey.from && f.to === journey.to && f.mode === journey.mode
  );
  if (isDuplicate) return favorites[0];

  const newFav: FavoriteJourney = {
    id: generateId(),
    ...journey,
    createdAt: new Date().toISOString(),
  };

  const updated = [newFav, ...favorites];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return newFav;
}

export function removeFavorite(id: string): FavoriteJourney[] {
  const favorites = getFavorites().filter((f) => f.id !== id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  return favorites;
}

export function isFavorite(from: string, to: string, mode: string): boolean {
  return getFavorites().some(
    (f) => f.from === from && f.to === to && f.mode === mode
  );
}

// ─── History ──────────────────────────────────────────────────────

export function getHistory(): HistoryJourney[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToHistory(journey: {
  from: string;
  to: string;
  mode: string;
  modeColor: string;
  duration: string;
  co2: number;
}): HistoryJourney[] {
  const history = getHistory();

  const newEntry: HistoryJourney = {
    id: generateId(),
    ...journey,
    date: new Date().toISOString(),
  };

  // Remove duplicate if same route was just searched
  const filtered = history.filter(
    (h) => !(h.from === journey.from && h.to === journey.to && h.mode === journey.mode)
  );

  const updated = [newEntry, ...filtered].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

// ─── Stats ────────────────────────────────────────────────────────

export interface UserStats {
  totalTrips: number;
  co2Saved: number; // in grams
  favoriteCount: number;
}

export function getStats(): UserStats {
  if (typeof window === "undefined") return { totalTrips: 0, co2Saved: 0, favoriteCount: 0 };
  try {
    const data = localStorage.getItem(STATS_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // ignore
  }
  // Compute from favorites and history
  const favorites = getFavorites();
  const history = getHistory();
  const totalTrips = history.length;
  const co2Saved = history.reduce((sum, h) => sum + (h.co2 > 0 ? Math.round(h.co2 * 4.3) : 0), 0);
  return {
    totalTrips,
    co2Saved,
    favoriteCount: favorites.length,
  };
}

export function incrementTrips(co2: number): UserStats {
  const stats = getStats();
  stats.totalTrips += 1;
  stats.co2Saved += co2 > 0 ? Math.round(co2 * 4.3) : 0; // vs car
  stats.favoriteCount = getFavorites().length;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  return stats;
}

// ─── Preferences ──────────────────────────────────────────────────

export interface UserPreferences {
  defaultMode: "fast" | "eco" | "cheap";
  notifications: boolean;
  accessibility: boolean;
  darkMode: boolean;
}

const PREFS_KEY = "urbanflow_prefs";

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