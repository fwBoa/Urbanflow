"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiService } from "@/services/api";
import type { PrimLine, PrimStop, PrimVelibStation, NearbyVelibStation, JourneyResult, GeocodeResult, ReverseGeocodeResult } from "@/services/api";

// Re-export types for convenience
export type { NearbyVelibStation } from "@/services/api";

// ─── Generic API data hook (DRY) ───────────────────────────────────
/**
 * Hook générique pour fetch des données API avec loading/error.
 * Factorise le pattern useState/useEffect/then/catch/finally répété
 * dans tous les hooks de données.
 */
function useApiData<T>(
  fetchFn: () => Promise<T>,
  defaultValue: T,
  deps: React.DependencyList,
  initialLoading = true,
) {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchFn()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setData(defaultValue);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, loading, error };
}

// ─── Transport Modes ────────────────────────────────────────────────
export interface TransportModeLine {
  id: string;
  name: string;
  shortName: string;
  color: string;
  status: string;
}

export interface TransportMode {
  key: string;
  label: string;
  emoji: string;
  color: string;
  count: number;
  activeCount: number;
  lines: TransportModeLine[];
}

export function useTransportModes() {
  const { data: modes, loading, error } = useApiData<TransportMode[]>(
    () => apiService.getTransportModes().then((d) => d.modes || []),
    [],
    [],
  );
  return { modes, loading, error };
}

// ─── Lines by Mode ──────────────────────────────────────────────────
export interface LineByMode {
  id: string;
  name: string;
  shortName: string;
  color: string;
  status: string;
}

export interface LinesByMode {
  metro: LineByMode[];
  rer: LineByMode[];
  tram: LineByMode[];
  transilien: LineByMode[];
}

export function useLinesByMode() {
  const { data: linesByMode, loading, error } = useApiData<LinesByMode>(
    () => apiService.getLinesByMode(),
    { metro: [], rer: [], tram: [], transilien: [] },
    [],
  );
  return { linesByMode, loading, error };
}

// ─── Lines ────────────────────────────────────────────────────────────────
export function useLines(limit = 6) {
  const { data: lines, loading, error } = useApiData<PrimLine[]>(
    () => apiService.getLines(limit).then((d) => d.results || []),
    [],
    [limit],
  );
  return { lines, loading, error };
}

// ─── Stops search ──────────────────────────────────────────────────
export function useStopSearch(query: string, limit = 10) {
  const [stops, setStops] = useState<PrimStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    (q: string) => {
      if (!q || q.length < 2) {
        setStops([]);
        return;
      }
      setLoading(true);
      apiService
        .searchStops(q, limit)
        .then((data) => {
          setStops(data.results || []);
          setError(null);
        })
        .catch((err) => {
          setError(err.message);
          setStops([]);
        })
        .finally(() => setLoading(false));
    },
    [limit]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return { stops, loading, error };
}

// ─── Vélib' stations ──────────────────────────────────────────────
export function useVelibStations(limit = 50) {
  const { data: stations, loading, error } = useApiData<PrimVelibStation[]>(
    () => apiService.getVelibStations(limit).then((d) =>
      (d.results || []).filter(
        (s) =>
          s.status === "OPEN" &&
          s.position.lat > 48.7 &&
          s.position.lat < 49.0 &&
          s.position.lon > 2.1 &&
          s.position.lon < 2.6
      )
    ),
    [],
    [limit],
  );
  return { stations, loading, error };
}

// ─── Vélib' proches (F4) ──────────────────────────────────────────
export function useNearbyVelib(lat: number | null, lon: number | null, radiusKm = 2, limit = 10) {
  const { data: stations, loading, error } = useApiData<NearbyVelibStation[]>(
    () => {
      if (lat === null || lon === null) return Promise.resolve([]);
      return apiService.getNearbyVelibStations(lat, lon, radiusKm, limit).then((d) => d.stations || []);
    },
    [],
    [lat, lon, radiusKm, limit],
    false,
  );

  if (lat === null || lon === null) {
    return { stations: [] as NearbyVelibStation[], loading: false, error: null };
  }

  return { stations, loading, error };
}

// ─── Geocoding — Recherche d'adresses ──────────────────────────────────
export function useGeocode(query: string, limit = 5) {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    (q: string) => {
      if (!q || q.length < 3) {
        setResults([]);
        return;
      }
      setLoading(true);
      apiService
        .geocode(q, limit)
        .then((data) => {
          setResults(data.results || []);
          setError(null);
        })
        .catch((err) => {
          setError(err.message);
          setResults([]);
        })
        .finally(() => setLoading(false));
    },
    [limit]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 400);
    return () => clearTimeout(timer);
  }, [query, search]);

  return { results, loading, error };
}

// ─── Reverse Geocoding — Coordonnées → adresse ────────────────────────
export function useReverseGeocode() {
  const [result, setResult] = useState<ReverseGeocodeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lon: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.reverseGeocode(lat, lon);
      setResult(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { result, loading, error, reverseGeocode };
}

// ─── OSRM Routing — Géométrie réelle ─────────────────────────────────
export function useRoute() {
  const [geometry, setGeometry] = useState<[number, number][]>([]);
  const [distance, setDistance] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchRoute = useCallback(async (
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
    profile?: 'foot' | 'bike' | 'car',
  ) => {
    if (fetchingRef.current) return geometry;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getRoute({ originLat, originLon, destLat, destLon, profile });
      // OSRM GeoJSON: [lon, lat] → Leaflet: [lat, lon]
      const coords = data.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
      setGeometry(coords);
      setDistance(data.distance);
      setDuration(data.duration);
      return coords;
    } catch (err: any) {
      setError(err.message);
      setGeometry([]);
      return [];
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [geometry]);

  return { geometry, distance, duration, loading, error, fetchRoute };
}

// ─── Traffic messages ──────────────────────────────────────────────
export function useTrafficMessages(limit = 5) {
  const { data: messages, loading, error } = useApiData<unknown[]>(
    () => apiService.getTrafficMessages(limit).then((d) => ((d as Record<string, unknown>).results as unknown[]) || []),
    [],
    [limit],
  );
  return { messages, loading, error };
}

// ─── Health check ──────────────────────────────────────────────────
export function useHealthCheck() {
  const { data: status, loading } = useApiData<{ ok: boolean; source: string } | null>(
    () => apiService.healthCheck().then((d) => ({ ok: d.status === "ok", source: d.source })),
    null,
    [],
  );
  return { status, loading };
}

// ─── Journey search ────────────────────────────────────────────────
export function useJourney(
  origin: { lat: number; lon: number } | null,
  destination: { lat: number; lon: number } | null,
  departureTime?: string,
  modes?: string[],
) {
  const { data: journeys, loading, error } = useApiData<JourneyResult[]>(
    () => {
      if (!origin || !destination) return Promise.resolve([]);
      return apiService.searchJourney({
        originLat: origin.lat,
        originLon: origin.lon,
        destLat: destination.lat,
        destLon: destination.lon,
        departureTime,
        modes: modes?.join(","),
      }).then((d) => Array.isArray(d) ? d : []);
    },
    [],
    [origin, destination, departureTime, modes],
    false,
  );

  if (!origin || !destination) {
    return { journeys: [] as JourneyResult[], loading: false, error: null };
  }

  return { journeys, loading, error };
}