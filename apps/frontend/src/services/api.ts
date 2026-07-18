// In production (Docker) NEXT_PUBLIC_API_URL is unset, so API_BASE is "" and
// all fetches use relative "/api/..." paths routed to the backend by nginx.
// In dev, .env sets NEXT_PUBLIC_API_URL=http://localhost:4000 for cross-port access.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ─── Types ──────────────────────────────────────────────────────────

export interface PrimStop {
  arrid: string;
  arrname: string;
  arrtype: string;
  /** Modes desservant l'arrêt (libellés FR : Métro, Train, Bus, Tramway…). */
  arrmodes?: string[];
  /** Lignes desservant l'arrêt (mode + nom). */
  arrlines?: { mode: string; name: string }[];
  arrtown: string;
  arrpostalregion: string;
  arrgeopoint: { lon: number; lat: number };
  arraccessibility: string;
}

export interface PrimVelibStation {
  number: number;
  name: string;
  address: string;
  position: { lon: number; lat: number };
  status: string;
  bike_stands: number;
  available_bike_stands: number;
  available_bikes: number;
  last_update: string;
}

export interface NearbyVelibStation {
  id: string;
  name: string;
  position: { lon: number; lat: number };
  available_bikes: number;
  available_ebikes: number;
  available_mechanical: number;
  available_bike_stands: number;
  capacity: number;
  is_renting: boolean;
  is_returning: boolean;
  distance: number; // mètres
  arrondissement: string;
}

export interface PrimDataResponse<T> {
  total_count: number;
  results: T[];
}

export interface GeocodeResult {
  label: string;
  score: number;
  type: string;
  city: string;
  postcode: string;
  context: string;
  geometry: { type: string; coordinates: [number, number] }; // [lon, lat]
  isParis: boolean;
  /** Présents pour les arrêts GTFS (type === "gtfs_stop") : modes desservant l'arrêt. */
  modes?: string[];
  /** Lignes desservant l'arrêt (mode + nom). */
  lines?: { mode: string; name: string }[];
  /** ID arrêt GTFS (type === "gtfs_stop"). */
  gtfsStopId?: string;
}

export interface GeocodeResponse {
  total_count: number;
  results: GeocodeResult[];
}

export interface ReverseGeocodeResult {
  label: string;
  type: string;
  city: string;
  postcode: string;
  context?: string;
  geometry?: { type: string; coordinates: [number, number] };
  housenumber?: string;
  street?: string;
  isParis: boolean;
}

export interface RealtimeAlert {
  id: string;
  headerText: string;
  descriptionText?: string;
  severity: "info" | "warning" | "severe" | "unknown";
  affectedRoutes: string[];
  /** Identifiant technique stable de la ligne impactée quand disponible. */
  lineId?: string;
  activePeriod?: { start: string; end: string }[];
  cause?: string;
  effect?: string;
}

export interface JourneySegment {
  type: "walking" | "transit" | "velib";
  mode?: string;
  lineName?: string;
  /** Identifiant technique stable de la ligne (code opérateur) quand disponible. */
  lineId?: string;
  lineColor?: string;
  fromStop?: string;
  toStop?: string;
  durationMinutes: number;
  distanceKm: number;
  numStops?: number;
  departureTime?: string;
  arrivalTime?: string;
  co2Ggrams: number;
  instruction: string;
  // ─── Détails enrichis ────────────────────────────────────────────
  direction?: string;
  platform?: string;
  headsign?: string;
  waitTimeMinutes?: number;
  shapeId?: string;
  /**
   * Géométrie réelle du segment (paires [lon, lat]) — embarquée par Navitia
   * dans chaque section (geojson LineString). Présente → la carte trace la
   * vraie trajectoire sans lazy-load /shape/:id. Absente (itinéraire GTFS) →
   * repli sur shapeId (getShape).
   */
  geojson?: Array<[number, number]>;
}

export interface JourneyResult {
  durationMinutes: number;
  transfers: number;
  distanceKm: number;
  co2Ggrams: number;
  segments: JourneySegment[];
  departureTime: string;
  arrivalTime: string;
  isFallback?: boolean;
  alerts?: RealtimeAlert[];
}

export interface StopDeparture {
  tripId: string;
  routeId: string;
  lineName: string;
  lineColor: string;
  routeType: number;
  headsign: string;
  departureTime: string;
  arrivalTime: string;
  waitMinutes: number;
  platform?: string;
}

export interface NearbyStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: Array<{ id: string; name: string; color: string }>;
}

// ─── API Client ─────────────────────────────────────────────────────

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async fetch<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, { signal });
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // ─── Lines by Mode ─────────────────────────────────────────────────
  async getLinesByMode(signal?: AbortSignal): Promise<{
    metro: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    rer: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    tram: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    transilien: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
  }> {
    return this.fetch("/api/transport/lines-by-mode", signal);
  }

  // ─── Stops ──────────────────────────────────────────────────────────
  async searchStops(query: string, limit = 10, signal?: AbortSignal): Promise<PrimDataResponse<PrimStop>> {
    return this.fetch(
      `/api/transport/stops?limit=${limit}&where=search(arrname,"${encodeURIComponent(query)}")`,
      signal,
    );
  }

  // ─── Vélib' proches (F4) ────────────────────────────────────────────
  async getNearbyVelibStations(
    lat: number,
    lon: number,
    radiusKm = 2,
    limit = 10,
    signal?: AbortSignal,
  ): Promise<{ stations: NearbyVelibStation[]; total: number }> {
    return this.fetch(
      `/api/transport/velib-nearby?lat=${lat}&lon=${lon}&radius=${radiusKm}&limit=${limit}`,
      signal,
    );
  }

  // ─── Vélib' — Liste brute filtrée Paris ─────────────────────────────
  async getVelibStations(
    limit = 50,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<PrimDataResponse<PrimVelibStation>> {
    return this.fetch(`/api/transport/velib?limit=${limit}&offset=${offset}`, signal);
  }

  // ─── Geocoding ──────────────────────────────────────────────────────
  async geocode(query: string, limit = 5, signal?: AbortSignal): Promise<GeocodeResponse> {
    return this.fetch(
      `/api/transport/geocode?q=${encodeURIComponent(query)}&limit=${limit}`,
      signal,
    );
  }

  // ─── Reverse Geocoding ──────────────────────────────────────────────
  async reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<ReverseGeocodeResult> {
    return this.fetch(`/api/transport/reverse-geocode?lat=${lat}&lon=${lon}`, signal);
  }

  // ─── OSRM Routing — Géométrie réelle ────────────────────────────────
  async getRoute(
    params: {
      originLat: number;
      originLon: number;
      destLat: number;
      destLon: number;
      profile?: "foot" | "bike" | "car";
    },
    signal?: AbortSignal,
  ): Promise<{
    geometry: { type: string; coordinates: [number, number][] };
    distance: number;
    duration: number;
  }> {
    const query = new URLSearchParams({
      originLat: String(params.originLat),
      originLon: String(params.originLon),
      destLat: String(params.destLat),
      destLon: String(params.destLon),
    });
    if (params.profile) query.set("profile", params.profile);
    return this.fetch(`/api/transport/route?${query.toString()}`, signal);
  }

  // ─── Nearby stops ───────────────────────────────────────────────────
  async getNearbyStops(
    lat: number,
    lon: number,
    radiusKm = 0.5,
    limit = 10,
    signal?: AbortSignal,
  ): Promise<{
    stops: Array<{
      id: string;
      name: string;
      lat: number;
      lon: number;
      lines: Array<{ id: string; name: string; color: string }>;
    }>;
  }> {
    return this.fetch(
      `/api/transport/nearby?lat=${lat}&lon=${lon}&radius=${radiusKm}&limit=${limit}`,
      signal,
    );
  }

  // ─── Realtime alerts ────────────────────────────────────────────────
  async getRealtimeAlerts(signal?: AbortSignal): Promise<RealtimeAlert[]> {
    return this.fetch("/api/transport/realtime-alerts", signal);
  }

  // ─── Prochains départs par arrêt ────────────────────────────────────
  async getStopTimes(
    stopId: string,
    limit = 5,
    signal?: AbortSignal,
  ): Promise<{
    departures: StopDeparture[];
  }> {
    return this.fetch(
      `/api/transport/stop-times?stopId=${encodeURIComponent(stopId)}&limit=${limit}`,
      signal,
    );
  }

  // ─── Shape lazy load ────────────────────────────────────────────────
  async getShape(
    shapeId: string,
    signal?: AbortSignal,
  ): Promise<{
    shapeId: string;
    points: Array<{ lat: number; lon: number; seq: number }>;
  }> {
    return this.fetch(`/api/transport/shape/${encodeURIComponent(shapeId)}`, signal);
  }

  // ─── Journey ────────────────────────────────────────────────────────
  async searchJourney(
    params: {
      originLat: number;
      originLon: number;
      destLat: number;
      destLon: number;
      departureTime?: string;
      modes?: string;
      maxTransfers?: number;
      wheelchairAccessible?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<JourneyResult[]> {
    const query = new URLSearchParams({
      originLat: String(params.originLat),
      originLon: String(params.originLon),
      destLat: String(params.destLat),
      destLon: String(params.destLon),
    });
    if (params.departureTime) query.set("departureTime", params.departureTime);
    if (params.modes) query.set("modes", params.modes);
    if (params.maxTransfers !== undefined)
      query.set("maxTransfers", String(params.maxTransfers));
    if (params.wheelchairAccessible)
      query.set("wheelchair", "true");

    return this.fetch(`/api/transport/journey?${query.toString()}`, signal);
  }
}

export const apiService = new ApiService();
