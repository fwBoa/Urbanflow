// In production (Docker) NEXT_PUBLIC_API_URL is unset, so API_BASE is "" and
// all fetches use relative "/api/..." paths routed to the backend by nginx.
// In dev, .env sets NEXT_PUBLIC_API_URL=http://localhost:4000 for cross-port access.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ─── Types ──────────────────────────────────────────────────────────

export interface PrimStop {
  arrid: string;
  arrname: string;
  arrtype: string;
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

export interface NearbyScooter {
  id: string;
  operator: string;
  type: "trottinette" | "bike";
  position: { lat: number; lon: number };
  battery?: number;
  available: boolean;
  distance: number; // mètres
}

export interface NearbyScootersResponse {
  vehicles: NearbyScooter[];
  total: number;
  source: string;
  message?: string;
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
  activePeriod?: { start: string; end: string }[];
  cause?: string;
  effect?: string;
}

export interface JourneySegment {
  type: "walking" | "transit" | "velib";
  mode?: string;
  lineName?: string;
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

  private async fetch<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`);
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // ─── Lines by Mode ─────────────────────────────────────────────────
  async getLinesByMode(): Promise<{
    metro: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    rer: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    tram: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    transilien: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
  }> {
    return this.fetch("/api/transport/lines-by-mode");
  }

  // ─── Stops ──────────────────────────────────────────────────────────
  async searchStops(query: string, limit = 10): Promise<PrimDataResponse<PrimStop>> {
    return this.fetch(
      `/api/transport/stops?limit=${limit}&where=search(arrname,"${encodeURIComponent(query)}")`,
    );
  }

  // ─── Vélib' proches (F4) ────────────────────────────────────────────
  async getNearbyVelibStations(
    lat: number,
    lon: number,
    radiusKm = 2,
    limit = 10,
  ): Promise<{ stations: NearbyVelibStation[]; total: number }> {
    return this.fetch(
      `/api/transport/velib-nearby?lat=${lat}&lon=${lon}&radius=${radiusKm}&limit=${limit}`,
    );
  }

  // ─── Trottinettes/vélos partagés (GBFS free-floating) ───────────────
  async getNearbyScooters(
    lat: number,
    lon: number,
    radiusKm = 2,
    limit = 20,
  ): Promise<NearbyScootersResponse> {
    return this.fetch(
      `/api/transport/scooters-nearby?lat=${lat}&lon=${lon}&radius=${radiusKm}&limit=${limit}`,
    );
  }

  // ─── Vélib' — Liste brute filtrée Paris ─────────────────────────────
  async getVelibStations(
    limit = 50,
    offset = 0,
  ): Promise<PrimDataResponse<PrimVelibStation>> {
    return this.fetch(`/api/transport/velib?limit=${limit}&offset=${offset}`);
  }

  // ─── Geocoding ──────────────────────────────────────────────────────
  async geocode(query: string, limit = 5): Promise<GeocodeResponse> {
    return this.fetch(`/api/transport/geocode?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  // ─── Reverse Geocoding ──────────────────────────────────────────────
  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
    return this.fetch(`/api/transport/reverse-geocode?lat=${lat}&lon=${lon}`);
  }

  // ─── OSRM Routing — Géométrie réelle ────────────────────────────────
  async getRoute(params: {
    originLat: number;
    originLon: number;
    destLat: number;
    destLon: number;
    profile?: "foot" | "bike" | "car";
  }): Promise<{
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
    return this.fetch(`/api/transport/route?${query.toString()}`);
  }

  // ─── Nearby stops ───────────────────────────────────────────────────
  async getNearbyStops(
    lat: number,
    lon: number,
    radiusKm = 0.5,
    limit = 10,
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
    );
  }

  // ─── Realtime alerts ────────────────────────────────────────────────
  async getRealtimeAlerts(): Promise<RealtimeAlert[]> {
    return this.fetch("/api/transport/realtime-alerts");
  }

  // ─── Prochains départs par arrêt ────────────────────────────────────
  async getStopTimes(
    stopId: string,
    limit = 5,
  ): Promise<{
    departures: StopDeparture[];
  }> {
    return this.fetch(
      `/api/transport/stop-times?stopId=${encodeURIComponent(stopId)}&limit=${limit}`,
    );
  }

  // ─── Shape lazy load ────────────────────────────────────────────────
  async getShape(
    shapeId: string,
  ): Promise<{
    shapeId: string;
    points: Array<{ lat: number; lon: number; seq: number }>;
  }> {
    return this.fetch(`/api/transport/shape/${encodeURIComponent(shapeId)}`);
  }

  // ─── Journey ────────────────────────────────────────────────────────
  async searchJourney(params: {
    originLat: number;
    originLon: number;
    destLat: number;
    destLon: number;
    departureTime?: string;
    modes?: string;
    maxTransfers?: number;
  }): Promise<JourneyResult[]> {
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

    return this.fetch(`/api/transport/journey?${query.toString()}`);
  }
}

export const apiService = new ApiService();
