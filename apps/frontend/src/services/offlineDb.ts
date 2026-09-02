/**
 * Utilitaire IndexedDB pour le cache offline.
 * Deux stores :
 * - nearby_stops : les 20 derniers résultats de /api/transport/nearby
 * - last_trips   : le dernier itinéraire consulté par coordonnées, pour la
 *   consultation hors-ligne (itération 3). Clé = coordonnées arrondies, pas
 *   l'ID de page (instable) — une même recherche rejouée retrouve son trajet.
 */

const DB_NAME = "urbanflow_offline";
const DB_VERSION = 2;
const STORE_NAME = "nearby_stops";
const TRIP_STORE_NAME = "last_trips";
const MAX_ENTRIES = 20;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
      // Itération 3 : store du dernier trajet par coordonnées.
      if (!db.objectStoreNames.contains(TRIP_STORE_NAME)) {
        db.createObjectStore(TRIP_STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

export interface CachedNearbyEntry {
  key: string; // lat|lon|radius|limit
  lat: number;
  lon: number;
  radiusKm: number;
  limit: number;
  stops: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    lines: Array<{ id: string; name: string; color: string }>;
  }>;
  timestamp: number;
}

export async function getCachedNearbyStops(
  lat: number,
  lon: number,
  radiusKm: number,
  limit: number,
): Promise<CachedNearbyEntry["stops"] | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const key = `${lat.toFixed(3)}|${lon.toFixed(3)}|${radiusKm}|${limit}`;
    const req = store.get(key);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const entry: CachedNearbyEntry | undefined = req.result;
        if (entry && Date.now() - entry.timestamp < 1000 * 60 * 60 * 24) { // 24h TTL
          resolve(entry.stops);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheNearbyStops(
  lat: number,
  lon: number,
  radiusKm: number,
  limit: number,
  stops: CachedNearbyEntry["stops"],
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const key = `${lat.toFixed(3)}|${lon.toFixed(3)}|${radiusKm}|${limit}`;
    const entry: CachedNearbyEntry = {
      key,
      lat,
      lon,
      radiusKm,
      limit,
      stops,
      timestamp: Date.now(),
    };
    store.put(entry);

    // Trim to MAX_ENTRIES
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_ENTRIES) {
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            if (countReq.result - 1 > MAX_ENTRIES) {
              cursor.continue();
            }
          }
        };
      }
    };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore — cache is best-effort
  }
}

// ─── Dernier trajet consulté (itération 3 : consultation hors-ligne) ──

/** Clé stable par coordonnées arrondies (même précision que nearby_stops). */
function tripKey(originLat: number, originLon: number, destLat: number, destLon: number): string {
  return `${originLat.toFixed(3)}|${originLon.toFixed(3)}|${destLat.toFixed(3)}|${destLon.toFixed(3)}`;
}

/**
 * Mémorise le dernier itinéraire calculé pour des coordonnées données.
 * Appelé après chaque calcul réussi (best-effort, ne bloque jamais l'UI).
 */
export async function cacheLastTrip(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  trip: unknown,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(TRIP_STORE_NAME, "readwrite");
    const store = tx.objectStore(TRIP_STORE_NAME);
    store.put({
      key: tripKey(originLat, originLon, destLat, destLon),
      trip,
      timestamp: Date.now(),
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore — cache is best-effort
  }
}

/**
 * Retourne le dernier itinéraire mémorisé pour ces coordonnées, ou null.
 * TTL de 7 jours : au-delà, les horaires/favoris risquent d'être trop
 * périmés pour être présentés comme un itinéraire valable.
 */
export async function getCachedLastTrip(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
): Promise<unknown | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(TRIP_STORE_NAME, "readonly");
    const store = tx.objectStore(TRIP_STORE_NAME);
    const req = store.get(tripKey(originLat, originLon, destLat, destLon));
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const entry: { trip: unknown; timestamp: number } | undefined = req.result;
        if (entry && Date.now() - entry.timestamp < 1000 * 60 * 60 * 24 * 7) {
          resolve(entry.trip);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
