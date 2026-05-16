const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface PrimLine {
  id_line: string;
  name_line: string;
  shortname_line: string;
  transportmode: string;
  transportsubmode: string;
  operatorname: string;
  networkname: string;
  colourweb_hexa: string;
  textcolourweb_hexa: string;
  status: string;
  accessibility: string;
}

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
  // ─── Détails enrichis ──────────────────────────────────────────────
  direction?: string;        // ex: "direction Poissy"
  platform?: string;         // ex: "Voie 2"
  headsign?: string;         // ex: "Saint-Germain-en-Laye"
  waitTimeMinutes?: number;  // ex: 4
}

export interface JourneyResult {
  durationMinutes: number;
  transfers: number;
  distanceKm: number;
  co2Ggrams: number;
  segments: JourneySegment[];
  departureTime: string;
  arrivalTime: string;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`);
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // ─── Health ────────────────────────────────────────────────────────
  async healthCheck() {
    return this.fetch<{ status: string; source: string; apiKeyConfigured: boolean }>(
      "/api/transport/health"
    );
  }

  // ─── Lines ─────────────────────────────────────────────────────────
  async getLines(limit = 20, offset = 0): Promise<PrimDataResponse<PrimLine>> {
    return this.fetch(`/api/transport/lines?limit=${limit}&offset=${offset}`);
  }

  // ─── Stops ─────────────────────────────────────────────────────────
  async getStops(limit = 20, offset = 0): Promise<PrimDataResponse<PrimStop>> {
    return this.fetch(`/api/transport/stops?limit=${limit}&offset=${offset}`);
  }

  async searchStops(query: string, limit = 10): Promise<PrimDataResponse<PrimStop>> {
    return this.fetch(
      `/api/transport/stops?limit=${limit}&where=search(arrname,"${encodeURIComponent(query)}")`
    );
  }

  // ─── Stop-Lines ────────────────────────────────────────────────────
  async getStopLines(limit = 20, offset = 0) {
    return this.fetch(`/api/transport/stop-lines?limit=${limit}&offset=${offset}`);
  }

  // ─── Traffic ───────────────────────────────────────────────────────
  async getTrafficMessages(limit = 10) {
    return this.fetch(`/api/transport/traffic?limit=${limit}`);
  }

  // ─── Vélib' ────────────────────────────────────────────────────────
  async getVelibStations(limit = 20, offset = 0): Promise<PrimDataResponse<PrimVelibStation>> {
    return this.fetch(`/api/transport/velib?limit=${limit}&offset=${offset}`);
  }

  // ─── Elevators ─────────────────────────────────────────────────────
  async getElevatorStatus(limit = 20) {
    return this.fetch(`/api/transport/elevators?limit=${limit}`);
  }

  // ─── GTFS URLs ────────────────────────────────────────────────────
  async getGtfsUrls() {
    return this.fetch<{ gtfs_static: string; gtfs_rt: string }>("/api/transport/gtfs-url");
  }

  // ─── Geocoding ───────────────────────────────────────────────────────
  async geocode(query: string, limit = 5): Promise<GeocodeResponse> {
    return this.fetch(`/api/transport/geocode?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  // ─── Reverse Geocoding ───────────────────────────────────────────────
  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
    return this.fetch(`/api/transport/reverse-geocode?lat=${lat}&lon=${lon}`);
  }

  // ─── Journey ──────────────────────────────────────────────────────
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
    if (params.maxTransfers !== undefined) query.set("maxTransfers", String(params.maxTransfers));

    return this.fetch(`/api/transport/journey?${query.toString()}`);
  }
}

export const apiService = new ApiService();