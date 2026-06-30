// ─── Urban Flow Mobility — Shared Types ───

// ─── User ───
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  preferredMode: TransportMode;
  accessibilityNeeds: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TransportMode = 'rapide' | 'ecologique' | 'confortable';

// ─── Trip ───
export interface Trip {
  id: string;
  userId: string | null;
  origin: string;
  destination: string;
  departureTime: Date | null;
  arrivalTime: Date | null;
  duration: number;
  distance: number | null;
  transportModes: string;
  carbonFootprint: number | null;
  createdAt: Date;
}

// ─── Route ───
export interface Route {
  id: string;
  name: string;
  type: string;
  operator: string | null;
  isActive: boolean;
  createdAt: Date;
}

// ─── Stop ───
export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: string;
  routeId: string;
}

// ─── Favorite ───
export interface Favorite {
  id: string;
  userId: string;
  label: string;
  origin: string;
  destination: string;
  createdAt: Date;
}

// ─── Notification ───
export interface Notification {
  id: string;
  userId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

// ─── Transport Feed ───
export interface TransportFeed {
  id: string;
  sourceUrl: string;
  format: string;
  lastUpdate: Date | null;
  status: string;
  createdAt: Date;
}

// ─── API ───
export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: number;
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// ─── Search ───
export interface TripSearchRequest {
  origin: string;
  destination: string;
  departureTime?: Date;
  arrivalTime?: Date;
  preferences?: TransportMode;
}

export interface TripSearchResult {
  trips: Trip[];
  fastest: Trip | null;
  greenest: Trip | null;
  mostComfortable: Trip | null;
}

// ─── Carbon ───
export interface CarbonEstimate {
  gramsCO2: number;
  mode: string;
  distance: number;
}

// ─── PRIM / GTFS Types ───

/** GTFS Stop (arrêt) */
export interface GtfsStop {
  stop_id: string;
  stop_code?: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  zone_id?: string;
  stop_url?: string;
  location_type?: number; // 0=Stop, 1=Station, 2=Entrance/Exit
  parent_station?: string;
  stop_timezone?: string;
  wheelchair_boarding?: number;
  platform_code?: string;
}

/** GTFS Route (ligne) */
export interface GtfsRoute {
  route_id: string;
  agency_id?: string;
  route_short_name: string;
  route_long_name: string;
  route_desc?: string;
  route_type: number; // 0=Tram, 1=Subway, 2=Rail, 3=Bus, 4=Ferry, 5=Cable car, 6=Gondola, 7=Funicular
  route_url?: string;
  route_color?: string;
  route_text_color?: string;
  route_sort_order?: number;
}

/** GTFS Trip (course) */
export interface GtfsTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: number;
  shape_id?: string;
  wheelchair_accessible?: number;
  bikes_allowed?: number;
}

/** GTFS StopTime (horaire d'arrêt) */
export interface GtfsStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
  stop_headsign?: string;
  pickup_type?: number;
  drop_off_type?: number;
  shape_dist_traveled?: number;
  timepoint?: number;
}

/** GTFS Calendar (service) */
export interface GtfsCalendar {
  service_id: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_date: string;
  end_date: string;
}

/** GTFS Transfer (correspondance) */
export interface GtfsTransfer {
  from_stop_id: string;
  to_stop_id: string;
  transfer_type: number;
  min_transfer_time?: number;
}

/** PRIM API — Référentiel des lignes */
export interface PrimLineRecord {
  id_line: string;
  name_line: string;
  shortname_line: string;
  code_line?: string;
  status: string;
  transportmode: string;
  networkname: string;
  operatorname?: string;
  colour?: string;
  textcolour?: string;
}

/** PRIM API — Référentiel des arrêts */
export interface PrimStopRecord {
  id_stop: string;
  name_stop: string;
  lat_stop: number;
  lon_stop: number;
  stop_type?: string;
  id_line?: string;
  name_line?: string;
}

/** PRIM API — Message d'actualité */
export interface PrimTrafficMessage {
  id: string;
  title: string;
  text?: string;
  date_start?: string;
  date_end?: string;
  severity?: string;
  affected_lines?: string[];
  category?: string;
}

/** PRIM API — Station Vélib' */
export interface PrimVelibStation {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  available_bikes: number;
  available_docks: number;
  is_operating: boolean;
  last_update?: string;
}

/** PRIM API — État ascenseur */
export interface PrimElevatorStatus {
  id: string;
  station_name: string;
  elevator_name: string;
  status: 'operational' | 'out_of service' | 'maintenance';
  last_update?: string;
}

/** PRIM Data API response wrapper */
export interface PrimDataResponse<T> {
  total_count: number;
  results: T[];
}

// ─── Journey Types (UrbanFlow domain) ───

/** Requête de recherche d'itinéraire */
export interface JourneyQuery {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  departureTime?: string;
  arrivalTime?: string;
  modes?: string[];
  wheelchairAccessible?: boolean;
  maxTransfers?: number;
}

/** Segment d'un itinéraire */
export interface JourneySegment {
  type: 'walking' | 'transit' | 'velib';
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
}

/** Résultat d'itinéraire */
export interface JourneyResult {
  durationMinutes: number;
  transfers: number;
  distanceKm: number;
  co2Ggrams: number;
  segments: JourneySegment[];
  departureTime: string;
  arrivalTime: string;
}

/** Résultat de calcul carbone */
export interface CarbonResult {
  mode: string;
  distanceKm: number;
  emissionsGco2: number;
  factor: number;
  source: string;
}

/** Comparaison carbone entre deux modes */
export interface CarbonComparison {
  referenceMode: string;
  comparedMode: string;
  savedGco2: number;
  savedPercent: number;
  carKmEquivalent: number;
}

// ─── Transport mode colors (from design spec) ───
export const TRANSPORT_COLORS: Record<string, string> = {
  metro: '#2E7D9B',
  bus: '#7CB342',
  velo: '#4CAF50',
  voiture: '#FF6B35',
  marche: '#FF9800',
  rer: '#1A5A73',
  tram: '#7CB342',
  train: '#1A5A73',
};

// ─── Design tokens ───
export const DESIGN_TOKENS = {
  colors: {
    primaryBlue: '#2E7D9B',
    primaryBlueLight: '#4A9DB8',
    primaryBlueDark: '#1A5A73',
    ecoGreen: '#7CB342',
    mobilityOrange: '#FF6B35',
    textPrimary: '#1A1A2E',
    textSecondary: '#4A4A5A',
    textTertiary: '#8A8A9A',
    background: '#FFFFFF',
    surface: '#F5F7FA',
    border: '#E2E8F0',
    borderFocus: '#2E7D9B',
    mapArea: '#D4E6F1',
    favoriteRed: '#E53935',
  },
  spacing: {
    headerHeight: 60,
    navBarHeight: 80,
    cardBorderRadius: 12,
    cardPadding: 16,
    ctaBorderRadius: 26,
    ctaHeight: 52,
    chipBorderRadius: 18,
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    display: { size: 32, weight: 'bold' as const },
    h1: { size: 24, weight: 'semibold' as const },
    h2: { size: 20, weight: 'semibold' as const },
    h3: { size: 18, weight: 'medium' as const },
    body: { size: 16, weight: 'regular' as const },
    small: { size: 14, weight: 'regular' as const },
    caption: { size: 12, weight: 'medium' as const },
    overline: { size: 10, weight: 'semibold' as const },
  },
} as const;