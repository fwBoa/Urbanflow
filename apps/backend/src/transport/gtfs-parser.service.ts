import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as AdmZip from 'adm-zip';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

// Workaround: adm-zip default export needs .default in ESM/TS contexts
const AdmZipClass = (AdmZip as any).default || AdmZip;

/**
 * Types GTFS — Structures de données pour les fichiers GTFS statiques
 * Référence : https://gtfs.org/documentation/schedule/reference/
 */
export interface GtfsAgency {
  agency_id: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
  agency_lang?: string;
  agency_phone?: string;
  agency_fare_url?: string;
  agency_email?: string;
}

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

export interface GtfsTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: number; // 0=Outbound, 1=Inbound
  shape_id?: string;
  wheelchair_accessible?: number;
  bikes_allowed?: number;
}

export interface GtfsStopTime {
  trip_id: string;
  arrival_time: string; // HH:MM:SS
  departure_time: string; // HH:MM:SS
  stop_id: string;
  stop_sequence: number;
  stop_headsign?: string;
  pickup_type?: number;
  drop_off_type?: number;
  continuous_pickup?: number;
  continuous_drop_off?: number;
  shape_dist_traveled?: number;
  timepoint?: number;
}

export interface GtfsCalendar {
  service_id: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_date: string; // YYYYMMDD
  end_date: string; // YYYYMMDD
}

export interface GtfsCalendarDate {
  service_id: string;
  date: string; // YYYYMMDD
  exception_type: number; // 1=Added, 2=Removed
}

export interface GtfsShape {
  shape_id: string;
  shape_pt_lat: number;
  shape_pt_lon: number;
  shape_pt_sequence: number;
  shape_dist_traveled?: number;
}

export interface GtfsTransfer {
  from_stop_id: string;
  to_stop_id: string;
  transfer_type: number; // 0=Recommended, 1=Timed, 2=Min transfer time, 3=Not possible
  min_transfer_time?: number; // seconds
}

/**
 * Index GTFS — Structures optimisées pour les requêtes rapides
 */
export interface GtfsIndex {
  stopsById: Map<string, GtfsStop>;
  routesById: Map<string, GtfsRoute>;
  tripsByRoute: Map<string, GtfsTrip[]>;
  stopTimesByTrip: Map<string, GtfsStopTime[]>;
  stopTimesByStop: Map<string, GtfsStopTime[]>;
  calendarByService: Map<string, GtfsCalendar>;
  calendarDatesByService: Map<string, GtfsCalendarDate[]>;
  shapesById: Map<string, GtfsShape[]>;
  transfersByStop: Map<string, GtfsTransfer[]>;
  agenciesById: Map<string, GtfsAgency>;
}

/**
 * Service de parsing des fichiers GTFS statiques
 *
 * Le GTFS (General Transit Feed Specification) est le format standard
 * de données de transport en commun. PRIM fournit un fichier ZIP
 * contenant des fichiers texte CSV mis à jour 3 fois/jour.
 *
 * Ce service :
 * 1. Télécharge et extrait le ZIP GTFS
 * 2. Parse chaque fichier texte en structures typées
 * 3. Construit des index optimisés pour les requêtes rapides
 * 4. Expose les données via des méthodes de recherche
 */
@Injectable()
export class GtfsParserService implements OnModuleInit {
  private readonly logger = new Logger(GtfsParserService.name);
  private readonly dataDir: string;
  private index: GtfsIndex | null = null;
  private lastLoadTime: Date | null = null;
  private loading = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.dataDir = path.join(process.cwd(), 'data', 'gtfs');
  }

  /**
   * Auto-load GTFS data at startup
   * Downloads the PRIM GTFS ZIP if not cached, then parses it
   */
  async onModuleInit() {
    this.logger.log('GtfsParserService initializing — attempting GTFS auto-load...');
    try {
      await this.downloadAndLoad();
    } catch (error) {
      this.logger.warn(`GTFS auto-load failed: ${error instanceof Error ? error.message : error}. Journey planning will use fallback data.`);
      // Don't crash — fallback journey data will be used
    }
  }

  /**
   * Download GTFS ZIP from PRIM and load it
   */
  async downloadAndLoad(): Promise<void> {
    if (this.loading) {
      this.logger.log('GTFS download already in progress, skipping...');
      return;
    }
    this.loading = true;

    try {
      const apiKey = this.configService.get<string>('PRIM_API_KEY') || 'ccNiEkDJ8KFvcMT8lnnuGvQWuCdBjsIo';

      // Try multiple GTFS sources in order
      const gtfsSources: Array<{ name: string; url: string; headers: Record<string, string> }> = [
        // Data portal (IDFM) — URL actuelle fonctionnelle
        {
          name: 'Data portal (IDFM)',
          url: 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/offre-horaires-tc-gtfs-idfm/exports/zip',
          headers: {},
        },
        // PRIM API (direct) — endpoint obsolète, gardé en fallback
        {
          name: 'PRIM API (direct - obsolete)',
          url: 'https://prim.iledefrance-mobilites.fr/v1/gtfs/static/download',
          headers: { apikey: apiKey },
        },
      ];

      // Ensure data directory exists
      const zipDir = path.join(this.dataDir, 'downloads');
      if (!fs.existsSync(zipDir)) {
        fs.mkdirSync(zipDir, { recursive: true });
      }

      const zipPath = path.join(zipDir, 'idfm-gtfs-static.zip');

      // Check if we have a recent cache (less than 8 hours old)
      if (fs.existsSync(zipPath)) {
        const stats = fs.statSync(zipPath);
        const ageMs = Date.now() - stats.mtimeMs;
        const maxAgeMs = 8 * 60 * 60 * 1000; // 8 hours
        if (ageMs < maxAgeMs && stats.size > 1000000) {
          // At least 1MB to be valid
          this.logger.log(`Using cached GTFS ZIP (${Math.round(ageMs / 60000)} minutes old, ${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
          await this.loadFromZip(zipPath);
          return;
        }
        this.logger.log(`Cached GTFS ZIP is ${Math.round(ageMs / 3600000)} hours old, re-downloading...`);
      }

      // Try each source
      let downloaded = false;
      for (const source of gtfsSources) {
        try {
          this.logger.log(`Trying GTFS source: ${source.name}...`);
          const response = await firstValueFrom(
            this.httpService.get(source.url, {
              responseType: 'arraybuffer',
              headers: source.headers,
              timeout: 180000, // 3 minutes timeout (GTFS files can be large)
              maxRedirects: 5,
            }),
          );

          if (response.data && response.data.byteLength > 1000000) {
            fs.writeFileSync(zipPath, Buffer.from(response.data));
            const sizeMB = (response.data.byteLength / 1024 / 1024).toFixed(1);
            this.logger.log(`GTFS ZIP downloaded from ${source.name} (${sizeMB} MB)`);
            downloaded = true;
            break;
          } else {
            this.logger.warn(`GTFS ZIP from ${source.name} too small (${response.data?.byteLength || 0} bytes), trying next source...`);
          }
        } catch (err) {
          this.logger.warn(`Failed to download from ${source.name}: ${err instanceof Error ? err.message : err}`);
        }
      }

      if (!downloaded) {
        throw new Error('All GTFS download sources failed');
      }

      // Load the data
      await this.loadFromZip(zipPath);
    } catch (error) {
      this.logger.error(`Failed to download GTFS: ${error instanceof Error ? error.message : error}`);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Charge un fichier GTFS ZIP, l'extrait et parse les données
   */
  async loadFromZip(zipPath: string): Promise<void> {
    this.logger.log(`Loading GTFS data from ${zipPath}...`);
    const startTime = Date.now();

    try {
      // Extraire le ZIP
      const zip = new AdmZipClass(zipPath);
      const extractDir = path.join(this.dataDir, 'extracted');
      zip.extractAllTo(extractDir, true);

      // Parser chaque fichier
      const agencies = this.parseFile<GtfsAgency>(
        path.join(extractDir, 'agency.txt'),
      );
      const stops = this.parseFile<GtfsStop>(
        path.join(extractDir, 'stops.txt'),
      );
      const routes = this.parseFile<GtfsRoute>(
        path.join(extractDir, 'routes.txt'),
      );
      const trips = this.parseFile<GtfsTrip>(
        path.join(extractDir, 'trips.txt'),
      );
      const stopTimes = this.parseFile<GtfsStopTime>(
        path.join(extractDir, 'stop_times.txt'),
      );
      const calendar = this.parseFile<GtfsCalendar>(
        path.join(extractDir, 'calendar.txt'),
      );
      const calendarDates = this.parseFile<GtfsCalendarDate>(
        path.join(extractDir, 'calendar_dates.txt'),
      );
      const shapes = this.parseFile<GtfsShape>(
        path.join(extractDir, 'shapes.txt'),
      );
      const transfers = this.parseFile<GtfsTransfer>(
        path.join(extractDir, 'transfers.txt'),
      );

      // Construire les index
      this.index = this.buildIndex(
        agencies,
        stops,
        routes,
        trips,
        stopTimes,
        calendar,
        calendarDates,
        shapes,
        transfers,
      );

      this.lastLoadTime = new Date();
      const elapsed = Date.now() - startTime;
      this.logger.log(
        `GTFS data loaded in ${elapsed}ms — ` +
          `${stops.length} stops, ${routes.length} routes, ${trips.length} trips`,
      );
    } catch (error) {
      this.logger.error(`Failed to load GTFS data: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Parse un fichier GTFS texte (CSV) en tableau d'objets typés
   */
  private parseFile<T>(filePath: string): T[] {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`GTFS file not found: ${filePath}`);
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');

    if (lines.length === 0) return [];

    // Première ligne = en-têtes
    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().replace(/"/g, ''));

    const records: T[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      if (values.length !== headers.length) continue;

      const record: Record<string, any> = {};
      for (let j = 0; j < headers.length; j++) {
        const rawValue = values[j]?.trim() ?? '';
        record[headers[j]] = this.castValue(rawValue, headers[j]);
      }

      records.push(record as T);
    }

    this.logger.debug(`Parsed ${records.length} records from ${path.basename(filePath)}`);
    return records;
  }

  /**
   * Parse une ligne CSV en gérant les guillemets
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  /**
   * Cast une valeur string vers le type approprié selon le nom du champ GTFS
   */
  private castValue(value: string, fieldName: string): any {
    if (value === '') return undefined;

    // Champs numériques GTFS
    const numericFields = [
      'stop_lat', 'stop_lon', 'route_type', 'direction_id',
      'stop_sequence', 'pickup_type', 'drop_off_type',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      'saturday', 'sunday', 'exception_type', 'transfer_type',
      'min_transfer_time', 'shape_pt_sequence', 'shape_dist_traveled',
      'shape_pt_lat', 'shape_pt_lon', 'location_type',
      'wheelchair_boarding', 'wheelchair_accessible', 'bikes_allowed',
      'continuous_pickup', 'continuous_drop_off', 'timepoint',
      'route_sort_order',
    ];

    if (numericFields.includes(fieldName)) {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }

    return value;
  }

  /**
   * Construit les index optimisés à partir des données GTFS brutes
   */
  private buildIndex(
    agencies: GtfsAgency[],
    stops: GtfsStop[],
    routes: GtfsRoute[],
    trips: GtfsTrip[],
    stopTimes: GtfsStopTime[],
    calendar: GtfsCalendar[],
    calendarDates: GtfsCalendarDate[],
    shapes: GtfsShape[],
    transfers: GtfsTransfer[],
  ): GtfsIndex {
    const index: GtfsIndex = {
      stopsById: new Map(),
      routesById: new Map(),
      tripsByRoute: new Map(),
      stopTimesByTrip: new Map(),
      stopTimesByStop: new Map(),
      calendarByService: new Map(),
      calendarDatesByService: new Map(),
      shapesById: new Map(),
      transfersByStop: new Map(),
      agenciesById: new Map(),
    };

    // Agences
    for (const agency of agencies) {
      index.agenciesById.set(agency.agency_id, agency);
    }

    // Arrêts
    for (const stop of stops) {
      index.stopsById.set(stop.stop_id, stop);
    }

    // Lignes
    for (const route of routes) {
      index.routesById.set(route.route_id, route);
    }

    // Courses par ligne
    for (const trip of trips) {
      const routeTrips = index.tripsByRoute.get(trip.route_id) || [];
      routeTrips.push(trip);
      index.tripsByRoute.set(trip.route_id, routeTrips);
    }

    // Horaires par course et par arrêt
    for (const st of stopTimes) {
      // Par course
      const tripTimes = index.stopTimesByTrip.get(st.trip_id) || [];
      tripTimes.push(st);
      index.stopTimesByTrip.set(st.trip_id, tripTimes);

      // Par arrêt
      const stopTimes2 = index.stopTimesByStop.get(st.stop_id) || [];
      stopTimes2.push(st);
      index.stopTimesByStop.set(st.stop_id, stopTimes2);
    }

    // Trier les horaires par séquence
    for (const [, times] of index.stopTimesByTrip) {
      times.sort((a, b) => a.stop_sequence - b.stop_sequence);
    }

    // Calendrier
    for (const cal of calendar) {
      index.calendarByService.set(cal.service_id, cal);
    }

    // Dates exceptionnelles
    for (const cd of calendarDates) {
      const dates = index.calendarDatesByService.get(cd.service_id) || [];
      dates.push(cd);
      index.calendarDatesByService.set(cd.service_id, dates);
    }

    // Tracés
    for (const shape of shapes) {
      const shapePoints = index.shapesById.get(shape.shape_id) || [];
      shapePoints.push(shape);
      index.shapesById.set(shape.shape_id, shapePoints);
    }

    // Trier les points de tracé par séquence
    for (const [, points] of index.shapesById) {
      points.sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
    }

    // Correspondances
    for (const transfer of transfers) {
      const stopTransfers = index.transfersByStop.get(transfer.from_stop_id) || [];
      stopTransfers.push(transfer);
      index.transfersByStop.set(transfer.from_stop_id, stopTransfers);
    }

    return index;
  }

  // ─── Méthodes de recherche ───────────────────────────────────────────

  /**
   * Retourne l'index GTFS complet (lance un chargement si nécessaire)
   */
  getIndex(): GtfsIndex | null {
    return this.index;
  }

  /**
   * Vérifie si les données GTFS sont chargées
   */
  isLoaded(): boolean {
    return this.index !== null;
  }

  /**
   * Date du dernier chargement
   */
  getLastLoadTime(): Date | null {
    return this.lastLoadTime;
  }

  /**
   * Retourne des statistiques sur les données GTFS chargées
   */
  getStats(): { stops: number; routes: number; trips: number; agencies: number } | null {
    if (!this.index) return null;
    return {
      stops: this.index.stopsById.size,
      routes: this.index.routesById.size,
      trips: this.index.tripsByRoute.size,
      agencies: this.index.agenciesById.size,
    };
  }

  /**
   * Recherche un arrêt par ID
   */
  getStopById(stopId: string): GtfsStop | undefined {
    return this.index?.stopsById.get(stopId);
  }

  /**
   * Recherche des arrêts par nom (recherche floue insensible à la casse)
   */
  searchStopsByName(query: string, limit = 20): GtfsStop[] {
    if (!this.index) return [];

    const normalizedQuery = query.toLowerCase().trim();
    const results: GtfsStop[] = [];

    for (const [, stop] of this.index.stopsById) {
      if (stop.stop_name.toLowerCase().includes(normalizedQuery)) {
        results.push(stop);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Recherche des arrêts à proximité (dans un rayon donné)
   */
  findStopsNearby(lat: number, lon: number, radiusKm = 0.5): GtfsStop[] {
    if (!this.index) return [];

    const results: { stop: GtfsStop; distance: number }[] = [];

    for (const [, stop] of this.index.stopsById) {
      const distance = this.haversineKm(lat, lon, stop.stop_lat, stop.stop_lon);
      if (distance <= radiusKm) {
        results.push({ stop, distance });
      }
    }

    // Trier par distance
    results.sort((a, b) => a.distance - b.distance);
    return results.map((r) => r.stop);
  }

  /**
   * Récupère les lignes desservant un arrêt
   */
  getRoutesForStop(stopId: string): GtfsRoute[] {
    if (!this.index) return [];

    const stopTimes = this.index.stopTimesByStop.get(stopId) || [];
    const tripIds = new Set(stopTimes.map((st) => st.trip_id));
    const routeIds = new Set<string>();

    for (const tripId of tripIds) {
      const tripTimes = this.index.stopTimesByTrip.get(tripId);
      if (tripTimes && tripTimes.length > 0) {
        // Trouver le trip pour obtenir le route_id
        for (const [, trips] of this.index.tripsByRoute) {
          const trip = trips.find((t) => t.trip_id === tripId);
          if (trip) {
            routeIds.add(trip.route_id);
            break;
          }
        }
      }
    }

    const routes: GtfsRoute[] = [];
    for (const routeId of routeIds) {
      const route = this.index.routesById.get(routeId);
      if (route) routes.push(route);
    }

    return routes;
  }

  /**
   * Récupère les prochains départs d'un arrêt
   */
  getNextDepartures(
    stopId: string,
    timeAfter: string, // HH:MM:SS
    limit = 10,
  ): { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[] {
    if (!this.index) return [];

    const stopTimes = this.index.stopTimesByStop.get(stopId) || [];
    const results: { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[] = [];

    const targetSeconds = this.timeToSeconds(timeAfter);

    for (const st of stopTimes) {
      const departureSeconds = this.timeToSeconds(st.departure_time);
      if (departureSeconds >= targetSeconds) {
        // Trouver le trip
        for (const [, trips] of this.index.tripsByRoute) {
          const trip = trips.find((t) => t.trip_id === st.trip_id);
          if (trip) {
            const route = this.index.routesById.get(trip.route_id);
            if (route) {
              results.push({ trip, route, stopTime: st });
            }
            break;
          }
        }
      }

      if (results.length >= limit) break;
    }

    // Trier par heure de départ
    results.sort((a, b) =>
      this.timeToSeconds(a.stopTime.departure_time) -
      this.timeToSeconds(b.stopTime.departure_time),
    );

    return results.slice(0, limit);
  }

  // ─── Utilitaires ─────────────────────────────────────────────────────

  /**
   * Distance haversine entre deux points GPS (en km)
   */
  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  /**
   * Convertit un temps GTFS "HH:MM:SS" en secondes depuis minuit
   * Gère les heures > 23 (ex: 25:30:00 = service après minuit)
   */
  private timeToSeconds(time: string): number {
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
}