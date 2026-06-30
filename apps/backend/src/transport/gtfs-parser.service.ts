import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
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
  tripsById: Map<string, GtfsTrip>;
  stopTimesByTrip: Map<string, GtfsStopTime[]>;
  /** Stop times par arrêt, triés EN PLACE par departure_time (binary search dans getNextDepartures). */
  stopTimesByStop: Map<string, GtfsStopTime[]>;
  /** Modes (route_type GTFS) desservant chaque arrêt — précalculé à l'indexation. */
  stopModesByStop: Map<string, number[]>;
  /** Lignes (route_short_name) desservant chaque arrêt, groupées par mode — précalculé. */
  stopLinesByStop: Map<string, { mode: number; name: string }[]>;
  calendarByService: Map<string, GtfsCalendar>;
  calendarDatesByService: Map<string, GtfsCalendarDate[]>;
  shapesById: Map<string, GtfsShape[]>;
  transfersByStop: Map<string, GtfsTransfer[]>;
  agenciesById: Map<string, GtfsAgency>;
  /** Spatial grid for O(1) nearby stop lookup */
  spatialGrid: Map<string, GtfsStop[]>;
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
/**
 * Binary search — retourne l'index du premier élément >= target
 * selon la clé fournie par keyFn.
 */
function bisectLeft<T>(arr: T[], target: number, keyFn: (item: T) => number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keyFn(arr[mid]) < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

const SPATIAL_GRID_LAT_BIN = 0.01;  // ~1.1 km
const SPATIAL_GRID_LON_BIN = 0.015; // ~1.1 km à latitude 48°N

/**
 * Priorité d'affichage des modes GTFS (route_type) : on met en avant les
 * modes lourds (train/RER > métro > tram > bus) pour qu'un arrêt multimodal
 * comme Châtelet soit présenté d'abord comme « train / métro » plutôt que « bus ».
 * Retourne <0 si a prioritaire, >0 si b, 0 si égal.
 */
const ROUTE_TYPE_PRIORITY: Record<number, number> = {
  2: 0, // Rail (RER / Transilien / train)
  1: 1, // Subway / Métro
  0: 2, // Tram
  3: 3, // Bus
  4: 4, // Ferry
  7: 5, // Funiculaire
  6: 6, // Gondola
  5: 7, // Cable car / Trolleybus
};
function routeTypePriority(a: number, b: number): number {
  const pa = ROUTE_TYPE_PRIORITY[a] ?? 99;
  const pb = ROUTE_TYPE_PRIORITY[b] ?? 99;
  return pa - pb;
}

/** Libellé français d'un route_type GTFS (aligné sur journey.service.getModeName). */
export function routeTypeLabel(routeType: number): string {
  switch (routeType) {
    case 0:
      return 'Tramway';
    case 1:
      return 'Métro';
    case 2:
      return 'Train';
    case 3:
      return 'Bus';
    case 4:
      return 'Navette fluviale';
    case 5:
      return 'Trolleybus';
    case 6:
      return 'Téléphérique';
    case 7:
      return 'Funiculaire';
    default:
      return 'Transport';
  }
}

/**
 * Clé de mode (anglaise, lower-case) d'un route_type GTFS — utilisée pour
 * choisir l'icône côté frontend (ex: getStopIcon). 'stop' par défaut.
 */
export function modeKey(routeType: number | undefined): string {
  switch (routeType) {
    case 0:
      return 'tram';
    case 1:
      return 'metro';
    case 2:
      return 'train';
    case 3:
      return 'bus';
    case 4:
      return 'ferry';
    default:
      return 'stop';
  }
}

@Injectable()
export class GtfsParserService implements OnModuleInit {
  private readonly logger = new Logger(GtfsParserService.name);
  private readonly dataDir: string;
  private index: GtfsIndex | null = null;
  private lastLoadTime: Date | null = null;
  private loading = false;
  /** Cache LRU borné des shapes lues paresseusement sur disque (évite la fuite mémoire). */
  private readonly shapeCache = new Map<string, GtfsShape[]>();
  private readonly SHAPE_CACHE_MAX = 100;

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
    this.logger.log('GtfsParserService initializing — GTFS auto-load lancé en arrière-plan (non bloquant).');
    // Non bloquant : on NE await pas downloadAndLoad() pour que app.listen() s'exécute
    // immédiatement. Les endpoints PRIM (métro/bus/vélib/alertes) — qui ne dépendent pas
    // du GTFS — sont ainsi disponibles dès le boot. Les endpoints GTFS (journey, nearby,
    // stop-times…) renvoient 503 "chargement en cours" jusqu'à ce que l'index soit prêt
    // (voir garde isLoaded() dans le controller).
    void this.downloadAndLoad().catch((error) => {
      this.logger.warn(
        `GTFS background load failed: ${error instanceof Error ? error.message : error}. ` +
          `GTFS-dependent endpoints stay unavailable; PRIM endpoints remain up.`,
      );
    });
  }

  /**
   * Rechargement périodique du GTFS (tous les jours à 3h du matin)
   * Évite que les données deviennent obsolètes après une mise à jour PRIM.
   */
  @Cron('0 3 * * *')
  async reloadGtfsCron(): Promise<void> {
    this.logger.log('[Cron] Rechargement nocturne du GTFS...');
    try {
      await this.downloadAndLoad();
      this.logger.log('[Cron] GTFS rechargé avec succès.');
    } catch (error) {
      this.logger.error(`[Cron] Échec du rechargement GTFS : ${error instanceof Error ? error.message : error}`);
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
      const apiKey = this.configService.get<string>('PRIM_API_KEY', '');
      if (!apiKey) {
        this.logger.warn(
          'PRIM_API_KEY is not set. The PRIM API GTFS source will be unavailable (register at https://prim.iledefrance-mobilites.fr/).',
        );
      }

      // Try multiple GTFS sources in order
      const gtfsSources: Array<{ name: string; url: string; headers: Record<string, string> }> = [
        // Direct FTP OpenDataSoft — URL fonctionnelle (transport.data.gouv.fr)
        {
          name: 'OpenDataSoft FTP (IDFM)',
          url: 'https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip',
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

      // Check if we have a recent AND valid cache (less than 8 hours old + fichiers requis présents)
      if (fs.existsSync(zipPath)) {
        const stats = fs.statSync(zipPath);
        const ageMs = Date.now() - stats.mtimeMs;
        const maxAgeMs = 8 * 60 * 60 * 1000; // 8 hours
        if (ageMs < maxAgeMs && stats.size > 1000000) {
          // Validation structurelle : tous les fichiers requis présents et de taille cohérente
          const validation = await this.validateGtfsZip(zipPath);
          if (validation.valid) {
            this.logger.log(
              `Using cached GTFS ZIP (${Math.round(ageMs / 60000)} minutes old, ${(validation.size / 1024 / 1024).toFixed(1)} MB)`,
            );
            await this.loadFromZip(zipPath);
            return;
          }
          this.logger.warn(
            `Cached GTFS ZIP is structurally invalid (missing/empty: ${validation.missing.join(', ')}), re-downloading...`,
          );
          // Cache invalide → on supprime pour forcer le re-téléchargement
          try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
        } else {
          this.logger.log(`Cached GTFS ZIP is ${Math.round(ageMs / 3600000)} hours old, re-downloading...`);
        }
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
   * Valide qu'un fichier GTFS ZIP contient les fichiers requis
   * @returns true si tous les fichiers essentiels sont présents
   */
  private async validateGtfsZip(zipPath: string): Promise<{ valid: boolean; missing: string[]; size: number }> {
    const REQUIRED_FILES = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt'];
    const OPTIONAL_FILES = ['calendar_dates.txt', 'transfers.txt', 'shapes.txt'];
    const MIN_FILE_SIZES: Record<string, number> = {
      'stops.txt': 50_000,         // >50KB (au moins quelques milliers d'arrêts)
      'routes.txt': 5_000,         // >5KB
      'trips.txt': 50_000,         // >50KB
      'stop_times.txt': 1_000_000, // >1MB (fichier massif typique IDFM ~700MB)
    };

    try {
      const stats = fs.statSync(zipPath);
      if (stats.size < 1_000_000) {
        return { valid: false, missing: REQUIRED_FILES, size: stats.size };
      }
      const zip = new AdmZipClass(zipPath);
      const entries = zip.getEntries().map((e: any) => e.entryName);
      const missing: string[] = [];
      for (const req of REQUIRED_FILES) {
        if (!entries.includes(req)) {
          missing.push(req);
          continue;
        }
        // Vérifier la taille décompressée
        const entry = zip.getEntry(req);
        if (entry && MIN_FILE_SIZES[req] && entry.header.size < MIN_FILE_SIZES[req]) {
          this.logger.warn(`GTFS ${req} trop petit (${entry.header.size} bytes, attendu > ${MIN_FILE_SIZES[req]})`);
          missing.push(req);
        }
      }
      return { valid: missing.length === 0, missing, size: stats.size };
    } catch (e) {
      return { valid: false, missing: REQUIRED_FILES, size: 0 };
    }
  }

  /**
   * Charge un fichier GTFS ZIP, l'extrait et parse les données.
   *
   * OPTIMISATION — Bounding box Paris :
   * Seuls les arrêts dans un rayon de ~25 km autour de Paris sont conservés.
   * Les trips, routes et stop_times sont filtrés en cascade.
   * Cela divise la consommation mémoire par ~3 et réduit le temps de parsing.
   */
  async loadFromZip(zipPath: string): Promise<void> {
    this.logger.log(`Loading GTFS data from ${zipPath}...`);
    const startTime = Date.now();

    try {
      // Extraire le ZIP — ou réutiliser les fichiers déjà extraits si le ZIP n'a pas
      // changé. extractAllTo (AdmZip) est SYNCHRONE et bloque l'event loop ~30-60s
      // sur 160 Mo : on l'évite au démarrage à chaud (fichiers présents sur le volume).
      const extractDir = path.join(this.dataDir, 'extracted');
      const markerPath = path.join(extractDir, '.extracted_from');
      let reuseExtracted = false;
      try {
        const zipStat = fs.statSync(zipPath);
        const marker = fs.readFileSync(markerPath, 'utf8');
        const [m, s] = marker.split('|');
        if (
          String(zipStat.mtimeMs) === m &&
          String(zipStat.size) === s &&
          fs.existsSync(path.join(extractDir, 'stops.txt'))
        ) {
          reuseExtracted = true;
        }
      } catch {
        /* marqueur absent → extraction nécessaire */
      }
      if (reuseExtracted) {
        this.logger.log('Reusing already-extracted GTFS files (ZIP unchanged) — skipping sync extraction.');
      } else {
        this.logger.log('Extracting GTFS ZIP…');
        const zip = new AdmZipClass(zipPath);
        zip.extractAllTo(extractDir, true);
        try {
          const zipStat = fs.statSync(zipPath);
          fs.writeFileSync(markerPath, `${zipStat.mtimeMs}|${zipStat.size}`);
        } catch {
          /* échec d'écriture du marqueur non bloquant */
        }
      }

      // ── 1. Parser les fichiers de base ─────────────────────────────────
      const agencies = await this.parseFile<GtfsAgency>(
        path.join(extractDir, 'agency.txt'),
      );
      const allStops = await this.parseFile<GtfsStop>(
        path.join(extractDir, 'stops.txt'),
      );
      const allRoutes = await this.parseFile<GtfsRoute>(
        path.join(extractDir, 'routes.txt'),
      );
      const allTrips = await this.parseFile<GtfsTrip>(
        path.join(extractDir, 'trips.txt'),
      );
      const calendar = await this.parseFile<GtfsCalendar>(
        path.join(extractDir, 'calendar.txt'),
      );
      const calendarDates = await this.parseFile<GtfsCalendarDate>(
        path.join(extractDir, 'calendar_dates.txt'),
      );
      // shapes.txt est optionnel et très volumineux (126 MB de points GPS).
      // On le ignore pour éviter l'OOM — non nécessaire pour le routing RAPTOR.
      const shapes: GtfsShape[] = [];

      // ── 2. Filtrer les arrêts par bounding box Paris ─────────────────────
      const { filteredStops, validStopIds } = this.filterStopsByRegion(allStops);
      const radiusKm = process.env.GTFS_RADIUS_KM || '15';
      this.logger.log(
        `Bounding-box filter: ${filteredStops.length}/${allStops.length} stops kept (≤${radiusKm} km from Paris)`,
      );

      // ── 3. Parser stop_times en streaming, filtrer par stop_id ─────────
      //     et collecter les trip_id réellement utilisés
      const stopTimesByTripTemp = new Map<string, GtfsStopTime[]>();
      const stopTimesByStopTemp = new Map<string, GtfsStopTime[]>();
      const validTripIds = new Set<string>();

      // Progression : stop_times.txt fait ~1,1 Go / 12,3 M lignes — sans logs,
      // le chargement reste muet pendant des minutes (semble bloqué).
      let stopTimesScanned = 0;
      let stopTimesKept = 0;

      await this.parseFileIncremental<GtfsStopTime>(
        path.join(extractDir, 'stop_times.txt'),
        (st) => {
          stopTimesScanned++;
          if (stopTimesScanned % 1_000_000 === 0) {
            this.logger.log(
              `stop_times: ${stopTimesScanned.toLocaleString('fr-FR')} lignes parcourues, ` +
                `${stopTimesKept.toLocaleString('fr-FR')} conservées…`,
            );
          }
          if (!validStopIds.has(st.stop_id)) return;
          stopTimesKept++;
          validTripIds.add(st.trip_id);

          const tripTimes = stopTimesByTripTemp.get(st.trip_id) || [];
          tripTimes.push(st);
          stopTimesByTripTemp.set(st.trip_id, tripTimes);

          const stopTimes2 = stopTimesByStopTemp.get(st.stop_id) || [];
          stopTimes2.push(st);
          stopTimesByStopTemp.set(st.stop_id, stopTimes2);
        },
      );
      this.logger.log(
        `stop_times: ${stopTimesScanned.toLocaleString('fr-FR')} lignes parcourues, ` +
          `${stopTimesKept.toLocaleString('fr-FR')} conservées (terminé).`,
      );

      // ── 4. Filtrer trips et routes en cascade ────────────────────────────
      const filteredTrips = allTrips.filter((t) => validTripIds.has(t.trip_id));
      const validRouteIds = new Set(filteredTrips.map((t) => t.route_id));
      const filteredRoutes = allRoutes.filter((r) => validRouteIds.has(r.route_id));

      this.logger.log(
        `Cascade filter: ${filteredTrips.length}/${allTrips.length} trips, ` +
          `${filteredRoutes.length}/${allRoutes.length} routes kept`,
      );

      // ── 5. Construire l'index avec les données filtrées ─────────────────
      const index = this.buildIndex(
        agencies,
        filteredStops,
        filteredRoutes,
        filteredTrips,
        [], // stopTimes — injectés manuellement ci-dessous
        calendar,
        calendarDates,
        shapes,
        [], // transfers — alimenté en streaming ci-dessous
      );

      // Transférer les stop_times parsés en streaming dans l'index
      index.stopTimesByTrip = stopTimesByTripTemp;
      index.stopTimesByStop = stopTimesByStopTemp;

      // Trier les horaires par arrêt EN PLACE par departure_time (binary search O(log n)
      // dans getNextDepartures). Tri en place (pas de copie) : 3×→2× l'empreinte mémoire
      // des stop_times, indispensable pour tenir sous le heap limit sur un hôte 8 Go.
      for (const [, times] of index.stopTimesByStop) {
        times.sort(
          (a, b) =>
            this.timeToSeconds(a.departure_time) - this.timeToSeconds(b.departure_time),
        );
      }

      // ── 5b. Précalculer modes & lignes par arrêt (train/métro/bus/tram…)
      //     Maintenant que stopTimesByStop est peuplé en streaming. buildIndex
      //     l'avait appelé sur stopTimes=[] (vide) — on le (re)calcule ici sur
      //     les vraies données. Agrège aussi vers la gare parente (parent_station)
      //     pour qu'un quay sans horaire direct hérite des modes de ses quais frères.
      this.buildStopModes(index);

      // ── 6. Parser transfers en streaming, filtrer par stop_id ──────────
      await this.parseFileIncremental<GtfsTransfer>(
        path.join(extractDir, 'transfers.txt'),
        (transfer) => {
          if (
            !validStopIds.has(transfer.from_stop_id) ||
            !validStopIds.has(transfer.to_stop_id)
          ) {
            return;
          }
          const stopTransfers = index.transfersByStop.get(transfer.from_stop_id) || [];
          stopTransfers.push(transfer);
          index.transfersByStop.set(transfer.from_stop_id, stopTransfers);
        },
      );

      // Trier les horaires par séquence
      for (const [, times] of index.stopTimesByTrip) {
        times.sort((a, b) => a.stop_sequence - b.stop_sequence);
      }

      this.index = index;
      this.lastLoadTime = new Date();
      const elapsed = Date.now() - startTime;
      this.logger.log(
        `GTFS data loaded in ${elapsed}ms — ` +
          `${filteredStops.length} stops, ${filteredRoutes.length} routes, ${filteredTrips.length} trips`,
      );
    } catch (error) {
      this.logger.error(`Failed to load GTFS data: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Cède la main à l'event loop. Le parsing GTFS est lourd et Node est monothreadé :
   * sans céder périodiquement, le chargement (lancé en arrière-plan) bloque le traitement
   * des requêtes HTTP et retarde même app.listen(). Appelé tous les N enregistrements.
   */
  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  /**
   * Parse un fichier GTFS texte (CSV) en tableau d'objets typés
   * Utilise un stream pour gérer les fichiers volumineux (ex: stop_times.txt > 500MB)
   */
  private async parseFile<T>(filePath: string): Promise<T[]> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`GTFS file not found: ${filePath}`);
      return [];
    }

    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headers: string[] = [];
    const records: T[] = [];
    let lineCount = 0;

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      if (lineCount === 0) {
        headers = line.split(',').map((h) => h.trim().replace(/"/g, ''));
      } else {
        const values = this.parseCsvLine(line);
        if (values.length !== headers.length) continue;

        const record: Record<string, any> = {};
        for (let j = 0; j < headers.length; j++) {
          const rawValue = values[j]?.trim() ?? '';
          record[headers[j]] = this.castValue(rawValue, headers[j]);
        }
        records.push(record as T);
      }
      lineCount++;
      // Cède la main régulièrement pour ne pas bloquer l'event loop (API + app.listen).
      if (lineCount % 50_000 === 0) await this.yieldToEventLoop();
    }

    this.logger.debug(`Parsed ${records.length} records from ${path.basename(filePath)}`);
    return records;
  }

  /**
   * Parse un fichier GTFS en streaming et appelle un callback pour chaque record.
   * Ne conserve aucun tableau en mémoire — utilisé pour les fichiers massifs
   * comme stop_times.txt afin d'éviter les pics de mémoire (OOM).
   */
  private async parseFileIncremental<T>(
    filePath: string,
    onRecord: (record: T) => void,
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`GTFS file not found: ${filePath}`);
      return;
    }

    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headers: string[] = [];
    let lineCount = 0;
    let recordCount = 0;

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      if (lineCount === 0) {
        headers = line.split(',').map((h) => h.trim().replace(/"/g, ''));
      } else {
        const values = this.parseCsvLine(line);
        if (values.length !== headers.length) continue;

        const record: Record<string, any> = {};
        for (let j = 0; j < headers.length; j++) {
          const rawValue = values[j]?.trim() ?? '';
          record[headers[j]] = this.castValue(rawValue, headers[j]);
        }
        onRecord(record as T);
        recordCount++;
      }
      lineCount++;
      // Cède la main régulièrement pour ne pas bloquer l'event loop (API + app.listen).
      if (lineCount % 50_000 === 0) await this.yieldToEventLoop();
    }

    this.logger.debug(`Parsed ${recordCount} records from ${path.basename(filePath)}`);
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
      tripsById: new Map(),
      stopTimesByTrip: new Map(),
      stopTimesByStop: new Map(),
      stopModesByStop: new Map(),
      stopLinesByStop: new Map(),
      calendarByService: new Map(),
      calendarDatesByService: new Map(),
      shapesById: new Map(),
      transfersByStop: new Map(),
      agenciesById: new Map(),
      spatialGrid: new Map(),
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
      index.tripsById.set(trip.trip_id, trip);
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

    // Trier les horaires par séquence (pour trajectoire trip)
    for (const [, times] of index.stopTimesByTrip) {
      times.sort((a, b) => a.stop_sequence - b.stop_sequence);
    }

    // Trier les horaires par arrêt EN PLACE par heure de départ (binary search rapide
    // dans getNextDepartures) — pas de copie, pour limiter l'empreinte mémoire.
    for (const [, times] of index.stopTimesByStop) {
      times.sort(
        (a, b) =>
          this.timeToSeconds(a.departure_time) - this.timeToSeconds(b.departure_time),
      );
    }

    // Modes & lignes desservant chaque arrêt (train/métro/bus/tram…).
    // Précalcul : voir buildStopModes(). Appelé aussi après injection des
    // stop_times en streaming dans loadFromZip (buildIndex reçoit stopTimes=[]).
    this.buildStopModes(index);

    // Grille spatiale pour findStopsNearby O(1)
    for (const [, stop] of index.stopsById) {
      const latBin = Math.floor(stop.stop_lat / SPATIAL_GRID_LAT_BIN);
      const lonBin = Math.floor(stop.stop_lon / SPATIAL_GRID_LON_BIN);
      const key = `${latBin}|${lonBin}`;
      const cell = index.spatialGrid.get(key) || [];
      cell.push(stop);
      index.spatialGrid.set(key, cell);
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

  /**
   * Précalcule stopModesByStop + stopLinesByStop à partir de stopTimesByStop.
   *
   * Pour chaque arrêt desservi, on collecte ses route_ids (un seul lookup
   * trip→route par stop_time), puis on dérive les modes (route_type) et les
   * noms de ligne depuis routesById.
   *
   * Hiérarchie IDFM : les stop_times référencent les quais (location_type=0),
   * pas la gare parente (location_type=1). Un quay peut n'avoir aucun
   * stop_time (ex. variantes d'arrêts) : on agrège donc aussi les modes/lignes
   * vers la gare parente (parent_station), afin que getStopModes puisse
   * retomber sur elle quand le quay cherché est muet.
   */
  private buildStopModes(index: GtfsIndex): void {
    // 1. route_ids desservant chaque arrêt (quai)
    const stopRoutesByStop = new Map<string, Set<string>>();
    for (const [stopId, times] of index.stopTimesByStop) {
      const routeSet = new Set<string>();
      for (const st of times) {
        const trip = index.tripsById.get(st.trip_id);
        if (trip) routeSet.add(trip.route_id);
      }
      if (routeSet.size) stopRoutesByStop.set(stopId, routeSet);
    }

    // 2. Dériver modes + lignes par arrêt, et agréger vers la gare parente.
    const addRoute = (key: string, route: GtfsRoute): void => {
      let modeArr = index.stopModesByStop.get(key);
      if (!modeArr) {
        modeArr = [];
        index.stopModesByStop.set(key, modeArr);
      }
      if (!modeArr.includes(route.route_type)) modeArr.push(route.route_type);

      let lineArr = index.stopLinesByStop.get(key);
      if (!lineArr) {
        lineArr = [];
        index.stopLinesByStop.set(key, lineArr);
      }
      const name = route.route_short_name || route.route_long_name;
      if (!lineArr.some((l) => l.mode === route.route_type && l.name === name)) {
        lineArr.push({ mode: route.route_type, name });
      }
    };

    for (const [stopId, routeSet] of stopRoutesByStop) {
      const parent = index.stopsById.get(stopId)?.parent_station;
      for (const routeId of routeSet) {
        const route = index.routesById.get(routeId);
        if (!route) continue;
        addRoute(stopId, route); // le quai lui-même (précis : ses propres lignes)
        if (parent) addRoute(parent, route); // agrégation vers la gare parente
      }
    }
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
      // tripsByRoute.size == nombre de routes uniques, pas le total de trips.
      // tripsById recense chaque course (383k ici) → c'est la vraie valeur.
      trips: this.index.tripsById.size,
      agencies: this.index.agenciesById.size,
    };
  }

  /**
   * Lazy-load des points d'une shape depuis shapes.txt sur disque.
   * Évite de charger 126 MB de shapes en mémoire au démarrage.
   */
  async getShapeById(shapeId: string): Promise<GtfsShape[]> {
    if (this.shapeCache.has(shapeId)) {
      // LRU : marquer comme récemment utilisé (déplacer en fin de Map)
      const cached = this.shapeCache.get(shapeId)!;
      this.shapeCache.delete(shapeId);
      this.shapeCache.set(shapeId, cached);
      return cached;
    }

    const shapesPath = path.join(this.dataDir, 'extracted', 'shapes.txt');
    if (!fs.existsSync(shapesPath)) {
      return [];
    }

    const points: GtfsShape[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(shapesPath) });
    let headers: string[] | null = null;

    for await (const line of rl) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      if (!headers) {
        headers = cols;
        continue;
      }
      const get = (name: string) => cols[headers!.indexOf(name)]?.replace(/^"|"$/g, '') || '';
      if (get('shape_id') !== shapeId) continue;
      points.push({
        shape_id: shapeId,
        shape_pt_lat: parseFloat(get('shape_pt_lat')),
        shape_pt_lon: parseFloat(get('shape_pt_lon')),
        shape_pt_sequence: parseInt(get('shape_pt_sequence'), 10),
        shape_dist_traveled: get('shape_dist_traveled')
          ? parseFloat(get('shape_dist_traveled'))
          : undefined,
      });
    }

    points.sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);
    this.shapeCache.set(shapeId, points);
    // LRU : éviction de l'entrée la plus ancienne si la borne est dépassée
    if (this.shapeCache.size > this.SHAPE_CACHE_MAX) {
      const oldest = this.shapeCache.keys().next().value;
      if (oldest !== undefined) this.shapeCache.delete(oldest);
    }
    this.logger.log(`Lazy-loaded shape ${shapeId}: ${points.length} points`);
    return points;
  }

  /**
   * Filtre les arrêts GTFS pour ne garder que ceux dans la région parisienne.
   *
   * Rayon configurable autour de Notre-Dame (48.8566, 2.3522).
   * Par défaut 15 km — couvre Paris intra-muros + proche banlieue.
   * Peut être étendu via GTFS_RADIUS_KM dans .env (utile sur VPS avec + de RAM).
   * Réduit la mémoire par ~3× vs le dataset IDFM complet (54k → ~15-20k arrêts).
   */
  private filterStopsByRegion(stops: GtfsStop[]): {
    filteredStops: GtfsStop[];
    validStopIds: Set<string>;
  } {
    const PARIS_CENTER_LAT = 48.8566;
    const PARIS_CENTER_LON = 2.3522;
    // Override via env si VPS avec plus de RAM (laisser 25 km pour la prod)
    const MAX_DISTANCE_KM = parseInt(process.env.GTFS_RADIUS_KM || '15', 10);

    const filteredStops: GtfsStop[] = [];
    const validStopIds = new Set<string>();

    for (const stop of stops) {
      const distance = this.haversineKm(
        stop.stop_lat,
        stop.stop_lon,
        PARIS_CENTER_LAT,
        PARIS_CENTER_LON,
      );
      if (distance <= MAX_DISTANCE_KM) {
        filteredStops.push(stop);
        validStopIds.add(stop.stop_id);
      }
    }

    return { filteredStops, validStopIds };
  }

  /**
   * Normalise une chaîne pour la recherche : minuscules + retrait des
   * diacritiques (accents) + collapsage des espaces multiples.
   * « Châtelet » → « chatelet », « Café  de la  Mairie » → « cafe de la mairie ».
   * Permet à un utilisateur tapant sans accent de matcher les noms GTFS accentués.
   */
  private normalizeForSearch(value: string): string {
    // NFD décompose les accents (ex. é → e + ́), puis on retire les
    // combining marks (U+0300–U+036F) → comparaison insensible aux accents.
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Recherche des arrêts par nom (recherche floue insensible à la casse ET aux accents).
   *
   * Les quais (location_type=0) sont regroupés sous leur gare parente
   * (parent_station) : on renvoie UN résultat par station (la gare parente
   * lorsqu'elle est indexée), de façon à présenter une entrée « Châtelet »
   * unique avec tous ses modes agrégés (métro + train + bus…) plutôt qu'une
   * liste de quais fragmentée. Les modes/lignes agrégés par gare parente sont
   * précalculés par buildStopModes().
   */
  searchStopsByName(query: string, limit = 20): GtfsStop[] {
    if (!this.index) return [];

    const normalizedQuery = this.normalizeForSearch(query);
    if (!normalizedQuery) return [];

    const results: GtfsStop[] = [];
    const seenStations = new Set<string>();

    for (const [, stop] of this.index.stopsById) {
      if (!this.normalizeForSearch(stop.stop_name).includes(normalizedQuery)) {
        continue;
      }
      // Clé de station = gare parente si le quai en a une, sinon lui-même.
      const stationId = stop.parent_station || stop.stop_id;
      if (seenStations.has(stationId)) continue;
      seenStations.add(stationId);
      // Représentant = la gare parente (StopPlace) quand elle est indexée,
      // pour que getStopModes(stationId) renvoie les modes agrégés.
      const representative = stop.parent_station
        ? this.index.stopsById.get(stop.parent_station) ?? stop
        : stop;
      results.push(representative);
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Modes (route_type GTFS) desservant un arrêt, triés par priorité
   * (train > métro > tram > bus > autres). Tableau vide si arrêt inconnu.
   * Utilisé pour préciser la nature d'un arrêt (train/métro/bus/tram).
   */
  getStopModes(stopId: string): number[] {
    if (!this.index) return [];
    let modes = this.index.stopModesByStop.get(stopId);
    // Fallback : le quay cherché n'a pas de stop_times propres (ex. point
    // d'arrêt sans horaire) → on retombe sur les modes agrégés de sa gare
    // parente (parent_station), précalculés par buildStopModes.
    if (!modes || !modes.length) {
      const parent = this.index.stopsById.get(stopId)?.parent_station;
      if (parent) modes = this.index.stopModesByStop.get(parent);
    }
    if (!modes || !modes.length) return [];
    return [...modes].sort(routeTypePriority);
  }

  /**
   * Lignes desservant un arrêt, triées par priorité de mode puis par nom.
   * Chaque entrée : { mode: route_type, name: route_short_name|long_name }.
   * Même fallback parent_station que getStopModes pour les quais sans horaire.
   */
  getStopLines(stopId: string): { mode: number; name: string }[] {
    if (!this.index) return [];
    let lines = this.index.stopLinesByStop.get(stopId);
    if (!lines || !lines.length) {
      const parent = this.index.stopsById.get(stopId)?.parent_station;
      if (parent) lines = this.index.stopLinesByStop.get(parent);
    }
    if (!lines || !lines.length) return [];
    return [...lines].sort(
      (a, b) => routeTypePriority(a.mode, b.mode) || a.name.localeCompare(b.name),
    );
  }

  /**
   * Recherche des arrêts à proximité (dans un rayon donné)
   * Si la position est trop éloignée de Paris (> 30km), retourne vide immédiatement.
   */
  findStopsNearby(lat: number, lon: number, radiusKm = 0.5, limit = 8): GtfsStop[] {
    if (!this.index) return [];

    // Vérifier rapidement si la position est dans la région parisienne
    const distanceFromParis = this.haversineKm(lat, lon, 48.8566, 2.3522);
    if (distanceFromParis > 30) {
      return []; // Hors Île-de-France — aucun arrêt disponible
    }

    const results: { stop: GtfsStop; distance: number }[] = [];
    const seen = new Set<string>();

    const latBin = Math.floor(lat / SPATIAL_GRID_LAT_BIN);
    const lonBin = Math.floor(lon / SPATIAL_GRID_LON_BIN);

    // Parcourir les 9 cellules voisines (centre + 8 autour)
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const key = `${latBin + dLat}|${lonBin + dLon}`;
        const cell = this.index.spatialGrid.get(key);
        if (!cell) continue;

        for (const stop of cell) {
          if (seen.has(stop.stop_id)) continue;
          seen.add(stop.stop_id);

          const distance = this.haversineKm(lat, lon, stop.stop_lat, stop.stop_lon);
          if (distance <= radiusKm) {
            results.push({ stop, distance });
          }
        }
      }
    }

    // Trier par distance et limiter
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, limit).map((r) => r.stop);
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
      const trip = this.index.tripsById.get(tripId);
      if (trip) {
        routeIds.add(trip.route_id);
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

    // stopTimesByStop est trié en place par departure_time (voir loadFromZip/buildIndex).
    const sorted = this.index.stopTimesByStop.get(stopId) || [];
    const results: { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[] = [];

    const targetSeconds = this.timeToSeconds(timeAfter);

    // Binary search O(log n) pour trouver le premier départ >= target
    const startIdx = bisectLeft(sorted, targetSeconds, (st) =>
      this.timeToSeconds(st.departure_time),
    );

    for (let i = startIdx; i < sorted.length; i++) {
      const st = sorted[i];
      const trip = this.index.tripsById.get(st.trip_id);
      if (!trip) continue;
      const route = this.index.routesById.get(trip.route_id);
      if (!route) continue;
      results.push({ trip, route, stopTime: st });
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Récupère les prochains départs d'un arrêt pour aujourd'hui,
   * en filtrant uniquement les courses actives (service_id valide aujourd'hui).
   */
  getStopDepartures(
    stopId: string,
    date: Date,
    limit = 5,
  ): Array<{
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
  }> {
    if (!this.index) return [];

    const activeServiceIds = this.getActiveServiceIds(date);
    const timeStr = this.formatTime(date);
    const nowSeconds = this.timeToSeconds(timeStr);

    const stopTimes = this.index.stopTimesByStop.get(stopId) || [];
    const results: Array<{
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
    }> = [];

    for (const st of stopTimes) {
      const departureSeconds = this.timeToSeconds(st.departure_time);
      if (departureSeconds < nowSeconds) continue;

      const trip = this.index.tripsById.get(st.trip_id);
      if (!trip) continue;

      // Filtrer par service actif
      if (activeServiceIds.size > 0 && !activeServiceIds.has(trip.service_id)) continue;

      const route = this.index.routesById.get(trip.route_id);
      if (!route) continue;

      const waitMinutes = Math.round((departureSeconds - nowSeconds) / 60);

      results.push({
        tripId: trip.trip_id,
        routeId: route.route_id,
        lineName: route.route_short_name || route.route_long_name,
        lineColor: route.route_color ? `#${route.route_color}` : '#999',
        routeType: route.route_type,
        headsign: trip.trip_headsign || route.route_long_name || '',
        departureTime: st.departure_time,
        arrivalTime: st.arrival_time,
        waitMinutes,
        platform: st.stop_headsign || undefined,
      });

      if (results.length >= limit * 3) break; // x3 pour le déduplication
    }

    // Dédoublonner par (lineName + headsign) et garder le plus proche
    const seen = new Map<string, typeof results[0]>();
    for (const dep of results) {
      const key = `${dep.lineName}|${dep.headsign}`;
      if (!seen.has(key) || dep.waitMinutes < seen.get(key)!.waitMinutes) {
        seen.set(key, dep);
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => a.waitMinutes - b.waitMinutes)
      .slice(0, limit);
  }

  /**
   * Format a date as HH:MM:SS
   */
  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /**
   * Get active service IDs for a given date based on calendar.txt
   */
  private getActiveServiceIds(date: Date): Set<string> {
    const index = this.index;
    if (!index) return new Set();

    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ...
    const dayFields: (keyof GtfsCalendar)[] = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ];
    const dayField = dayFields[dayOfWeek];

    const activeIds = new Set<string>();
    const dateNum = parseInt(
      date.toISOString().slice(0, 10).replace(/-/g, ''),
    );

    // Check calendar.txt
    for (const [serviceId, calendar] of index.calendarByService) {
      const startDate = parseInt(calendar.start_date);
      const endDate = parseInt(calendar.end_date);

      if (dateNum >= startDate && dateNum <= endDate && calendar[dayField] === 1) {
        activeIds.add(serviceId);
      }
    }

    // Apply calendar_dates exceptions (added=1, removed=2)
    for (const [serviceId, dates] of index.calendarDatesByService) {
      for (const cd of dates) {
        const cdDateNum = parseInt(cd.date);
        if (cdDateNum === dateNum) {
          if (cd.exception_type === 1) {
            activeIds.add(cd.service_id);
          } else if (cd.exception_type === 2) {
            activeIds.delete(cd.service_id);
          }
        }
      }
    }

    return activeIds;
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