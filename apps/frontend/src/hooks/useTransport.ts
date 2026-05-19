"use client";

import { useState, useEffect, useCallback } from "react";
import { apiService } from "@/services/api";
import type { PrimLine, PrimStop, PrimVelibStation, JourneyResult, GeocodeResult, ReverseGeocodeResult } from "@/services/api";

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
  const [modes, setModes] = useState<TransportMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiService
      .getTransportModes()
      .then((data) => {
        setModes(data.modes || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setModes([]);
      })
      .finally(() => setLoading(false));
  }, []);

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
  const [linesByMode, setLinesByMode] = useState<LinesByMode>({ metro: [], rer: [], tram: [], transilien: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiService
      .getLinesByMode()
      .then((data) => {
        setLinesByMode(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setLinesByMode({ metro: [], rer: [], tram: [], transilien: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  return { linesByMode, loading, error };
}

// ─── Lines ────────────────────────────────────────────────────────────────
export function useLines(limit = 6) {
  const [lines, setLines] = useState<PrimLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiService
      .getLines(limit)
      .then((data) => {
        setLines(data.results || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setLines([]);
      })
      .finally(() => setLoading(false));
  }, [limit]);

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
  const [stations, setStations] = useState<PrimVelibStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiService
      .getVelibStations(limit)
      .then((data) => {
        // Filter only OPEN stations in Paris area
        const openStations = (data.results || []).filter(
          (s) =>
            s.status === "OPEN" &&
            s.position.lat > 48.7 &&
            s.position.lat < 49.0 &&
            s.position.lon > 2.1 &&
            s.position.lon < 2.6
        );
        setStations(openStations);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setStations([]);
      })
      .finally(() => setLoading(false));
  }, [limit]);

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

  const fetchRoute = useCallback(async (
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
    profile?: 'foot' | 'bike' | 'car',
  ) => {
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
    }
  }, []);

  return { geometry, distance, duration, loading, error, fetchRoute };
}

// ─── Traffic messages ──────────────────────────────────────────────
export function useTrafficMessages(limit = 5) {
  const [messages, setMessages] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiService
      .getTrafficMessages(limit)
      .then((data) => {
        const results = (data as Record<string, unknown>).results;
        setMessages((results as unknown[]) || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setMessages([]);
      })
      .finally(() => setLoading(false));
  }, [limit]);

  return { messages, loading, error };
}

// ─── Health check ──────────────────────────────────────────────────
export function useHealthCheck() {
  const [status, setStatus] = useState<{
    ok: boolean;
    source: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiService
      .healthCheck()
      .then((data) => {
        setStatus({ ok: data.status === "ok", source: data.source });
      })
      .catch(() => setStatus({ ok: false, source: "unavailable" }))
      .finally(() => setLoading(false));
  }, []);

  return { status, loading };
}

// ─── Journey search ────────────────────────────────────────────────
export function useJourney(
  origin: { lat: number; lon: number } | null,
  destination: { lat: number; lon: number } | null,
  departureTime?: string,
) {
  const [journeys, setJourneys] = useState<JourneyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!origin || !destination) {
      setJourneys([]);
      return;
    }

    setLoading(true);
    apiService
      .searchJourney({
        originLat: origin.lat,
        originLon: origin.lon,
        destLat: destination.lat,
        destLon: destination.lon,
        departureTime,
      })
      .then((data) => {
        setJourneys(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setJourneys([]);
      })
      .finally(() => setLoading(false));
  }, [origin, destination, departureTime]);

  return { journeys, loading, error };
}