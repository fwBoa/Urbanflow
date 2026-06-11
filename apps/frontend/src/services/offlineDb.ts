/**
 * Utilitaire IndexedDB pour le cache offline des arrêts proches.
 * Stocke les 20 derniers résultats de /api/transport/nearby.
 */

const DB_NAME = "urbanflow_offline";
const DB_VERSION = 1;
const STORE_NAME = "nearby_stops";
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
