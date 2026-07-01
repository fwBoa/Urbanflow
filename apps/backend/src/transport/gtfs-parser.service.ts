import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as AdmZip from 'adm-zip';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GtfsDbService } from './gtfs-db.service';

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
 * Service de chargement et de lecture des données GTFS statiques.
 *
 * Stockage : PostgreSQL (tables gtfs_*). Les ~6,8 M stop_times vivent en base,
 * Node ne conserve rien en mémoire — l'ancien index en Maps (2-3 Go de heap)
 * qui OOM-killait le backend sur la VM Docker 3,8 Go a été supprimé.
 *
 * Chargement : streaming des fichiers GTFS → `COPY ... FROM STDIN` (pg-copy-streams).
 * Découpe bbox Paris (GTFS_RADIUS_KM) sur stops/stop_times/transfers.
 * Lectures : requêtes SQL paramétrées via GtfsDbService (le moteur RAPTOR
 * consomme getNextDepartures / getTripStopTimes / getTransfersFrom, etc.).
 * shapes.txt (126 Mo) reste chargé paresseusement depuis le disque.
 */
@Injectable()
export class GtfsParserService implements OnModuleInit {
  private readonly logger = new Logger(GtfsParserService.name);
  private readonly dataDir: string;
  private loading = false;
  /** Cache LRU borné des shapes lues paresseusement sur disque (évite la fuite mémoire). */
  private readonly shapeCache = new Map<string, GtfsShape[]>();
  private readonly SHAPE_CACHE_MAX = 100;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly gtfsDb: GtfsDbService,
  ) {
    this.dataDir = path.join(process.cwd(), 'data', 'gtfs');
  }

  /**
   * Auto-load GTFS data at startup
   * Downloads the PRIM GTFS ZIP if not cached, then loads it into PostgreSQL.
   */
  async onModuleInit() {
    this.logger.log(
      'GtfsParserService initializing — GTFS auto-load lancé en arrière-plan (non bloquant).',
    );
    // Non bloquant : on NE await pas downloadAndLoad() pour que app.listen() s'exécute
    // immédiatement. Les endpoints PRIM (métro/bus/vélib/alertes) — qui ne dépendent pas
    // du GTFS — sont ainsi disponibles dès le boot. Les endpoints GTFS (journey, nearby,
    // stop-times…) renvoient 503 "chargement en cours" jusqu'à ce que PG soit peuplé
    // (voir garde isLoaded() dans le controller).
    //
    // `force=false` : au boot, `loadFromZip` court-circuite le rechargement si PG est
    // déjà `loaded=TRUE` (données persistées dans le volume `postgres_data`). On ne
    // peut PAS faire ce garde ici même : `GtfsDbService.onModuleInit` (qui crée le pool
    // pg) n'est pas garanti terminé quand ce hook s'exécute → `isLoaded()` lèverait
    // « pool not initialized ». Le garde vit donc dans `loadFromZip`, là où le pool est
    // prêt. Le cron et le reload admin passent `force=true` pour rafraîchir à volonté.
    void this.downloadAndLoad(false).catch((error) => {
      this.logger.warn(
        `GTFS background load failed: ${error instanceof Error ? error.message : error}. ` +
          `GTFS-dependent endpoints stay unavailable; PRIM endpoints remain up.`,
      );
    });
  }

  /**
   * Rechargement périodique du GTFS (tous les jours à 3h du matin)
   * Évite que les données deviennent obsolètes après une mise à jour PRIM.
   * `force=true` : on rafraîchit toujours (le garde skip-if-loaded de `loadFromZip`
   * est réservé au boot).
   */
  @Cron('0 3 * * *')
  async reloadGtfsCron(): Promise<void> {
    this.logger.log('[Cron] Rechargement nocturne du GTFS...');
    try {
      await this.downloadAndLoad(true);
      this.logger.log('[Cron] GTFS rechargé avec succès.');
    } catch (error) {
      this.logger.error(
        `[Cron] Échec du rechargement GTFS : ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Download GTFS ZIP from PRIM and load it into PostgreSQL.
   */
  async downloadAndLoad(force = false): Promise<void> {
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
      const gtfsSources: Array<{
        name: string;
        url: string;
        headers: Record<string, string>;
      }> = [
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
            await this.loadFromZip(zipPath, force);
            return;
          }
          this.logger.warn(
            `Cached GTFS ZIP is structurally invalid (missing/empty: ${validation.missing.join(', ')}), re-downloading...`,
          );
          // Cache invalide → on supprime pour forcer le re-téléchargement
          try {
            fs.unlinkSync(zipPath);
          } catch {
            /* ignore */
          }
        } else {
          this.logger.log(
            `Cached GTFS ZIP is ${Math.round(ageMs / 3600000)} hours old, re-downloading...`,
          );
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
            this.logger.log(
              `GTFS ZIP downloaded from ${source.name} (${sizeMB} MB)`,
            );
            downloaded = true;
            break;
          } else {
            this.logger.warn(
              `GTFS ZIP from ${source.name} too small (${response.data?.byteLength || 0} bytes), trying next source...`,
            );
          }
        } catch (err) {
          this.logger.warn(
            `Failed to download from ${source.name}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      if (!downloaded) {
        throw new Error('All GTFS download sources failed');
      }

      // Load the data
      await this.loadFromZip(zipPath, force);
    } catch (error) {
      this.logger.error(
        `Failed to download GTFS: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Valide qu'un fichier GTFS ZIP contient les fichiers requis
   * @returns true si tous les fichiers essentiels sont présents
   */
  private async validateGtfsZip(
    zipPath: string,
  ): Promise<{ valid: boolean; missing: string[]; size: number }> {
    const REQUIRED_FILES = [
      'stops.txt',
      'routes.txt',
      'trips.txt',
      'stop_times.txt',
      'calendar.txt',
    ];
    const OPTIONAL_FILES = [
      'calendar_dates.txt',
      'transfers.txt',
      'shapes.txt',
    ];
    const MIN_FILE_SIZES: Record<string, number> = {
      'stops.txt': 50_000, // >50KB (au moins quelques milliers d'arrêts)
      'routes.txt': 5_000, // >5KB
      'trips.txt': 50_000, // >50KB
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
        if (
          entry &&
          MIN_FILE_SIZES[req] &&
          entry.header.size < MIN_FILE_SIZES[req]
        ) {
          this.logger.warn(
            `GTFS ${req} trop petit (${entry.header.size} bytes, attendu > ${MIN_FILE_SIZES[req]})`,
          );
          missing.push(req);
        }
      }
      void OPTIONAL_FILES; // conservé pour lisibilité (shapes = lazy disque)
      return { valid: missing.length === 0, missing, size: stats.size };
    } catch (e) {
      return { valid: false, missing: REQUIRED_FILES, size: 0 };
    }
  }

  // ─── Colonnes GTFS → colonnes table (mapping par nom d'en-tête) ───
  // Les colonnes GENERATED (stop_name_norm, *_seconds) sont exclues du COPY.
  private static readonly COLS_AGENCIES = [
    'agency_id',
    'agency_name',
    'agency_url',
    'agency_timezone',
    'agency_lang',
    'agency_phone',
    'agency_fare_url',
    'agency_email',
  ];
  private static readonly COLS_TRIPS = [
    'route_id',
    'service_id',
    'trip_id',
    'trip_headsign',
    'trip_short_name',
    'direction_id',
    'shape_id',
    'wheelchair_accessible',
    'bikes_allowed',
  ];
  private static readonly COLS_ROUTES = [
    'route_id',
    'agency_id',
    'route_short_name',
    'route_long_name',
    'route_desc',
    'route_type',
    'route_url',
    'route_color',
    'route_text_color',
    'route_sort_order',
  ];
  private static readonly COLS_CALENDAR = [
    'service_id',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'start_date',
    'end_date',
  ];
  private static readonly COLS_CALENDAR_DATES = [
    'service_id',
    'date',
    'exception_type',
  ];
  private static readonly COLS_STOPS = [
    'stop_id',
    'stop_code',
    'stop_name',
    'stop_desc',
    'stop_lat',
    'stop_lon',
    'location_type',
    'parent_station',
    'stop_timezone',
    'wheelchair_boarding',
    'platform_code',
    // stop_name_norm n'existe pas dans stops.txt : colonne calculée par le
    // loader (normalizeForSearch) car unaccent() n'est pas IMMUTABLE → pas de
    // GENERATED column (cf. gtfs-db.service.ts / init-db.sql).
    'stop_name_norm',
  ];
  private static readonly COLS_STOP_TIMES = [
    'trip_id',
    'arrival_time',
    'departure_time',
    'stop_id',
    'stop_sequence',
    'stop_headsign',
    'pickup_type',
    'drop_off_type',
    'shape_dist_traveled',
    'timepoint',
  ];
  private static readonly COLS_TRANSFERS = [
    'from_stop_id',
    'to_stop_id',
    'transfer_type',
    'min_transfer_time',
  ];

  /**
   * Charge un fichier GTFS ZIP, l'extrait et streamed les fichiers dans PostgreSQL
   * via COPY. Découpe bbox Paris (GTFS_RADIUS_KM) sur stops/stop_times/transfers.
   * Node ne conserve que validStopIds (~12k strings) en mémoire — pas d'index Maps.
   */
  async loadFromZip(zipPath: string, force = false): Promise<void> {
    // Garde skip-if-loaded RÉSERVÉ au boot (force=false). Les données GTFS
    // persistent dans le volume `postgres_data` : si un précédent chargement a
    // réussi (loaded=TRUE), on évite le COPY de ~24 min à chaque redémarrage.
    // Ici le pool pg est garanti prêt (loadFromZip est appelé depuis
    // downloadAndLoad, fire-and-forget après les onModuleInit). Le cron et le
    // reload admin passent force=true pour rafraîchir à volonté.
    if (!force) {
      try {
        if (await this.isLoaded()) {
          this.logger.log(
            'GTFS déjà chargé en PostgreSQL (loaded=TRUE) — rechargement ignoré.',
          );
          return;
        }
      } catch (error) {
        this.logger.warn(
          `isLoaded() check failed (${error instanceof Error ? error.message : error}) — rechargement complet.`,
        );
      }
    }
    this.logger.log(`Loading GTFS data from ${zipPath} into PostgreSQL...`);
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
        this.logger.log(
          'Reusing already-extracted GTFS files (ZIP unchanged) — skipping sync extraction.',
        );
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

      const radiusKm = parseInt(process.env.GTFS_RADIUS_KM || '15', 10);
      const client = await this.gtfsDb.getClient();

      try {
        // Schéma canonical (tables live) + préparation du staging `gtfs_*_next`.
        // Les lectures restent sur les tables live pendant tout le chargement :
        // loaded reste TRUE, aucun 503, aucun lock sur les tables live.
        await this.gtfsDb.ensureSchema();
        await this.gtfsDb.prepareStaging();

        // Fichiers petits (sans filtre). On sélectionne par nom de colonne
        // (le CSV source peut contenir des colonnes supplémentaires qu'on ignore).
        // Cible : tables staging `gtfs_*_next`.
        await this.streamCopy(
          client,
          'agency.txt',
          GtfsParserService.COLS_AGENCIES,
          'gtfs_agencies_next',
          (c, idx) => GtfsParserService.COLS_AGENCIES.map((h) => c[idx[h]]),
        );
        await this.streamCopy(
          client,
          'trips.txt',
          GtfsParserService.COLS_TRIPS,
          'gtfs_trips_next',
          (c, idx) => GtfsParserService.COLS_TRIPS.map((h) => c[idx[h]]),
        );
        await this.streamCopy(
          client,
          'routes.txt',
          GtfsParserService.COLS_ROUTES,
          'gtfs_routes_next',
          (c, idx) => GtfsParserService.COLS_ROUTES.map((h) => c[idx[h]]),
        );
        await this.streamCopy(
          client,
          'calendar.txt',
          GtfsParserService.COLS_CALENDAR,
          'gtfs_calendar_next',
          (c, idx) => GtfsParserService.COLS_CALENDAR.map((h) => c[idx[h]]),
        );
        await this.streamCopy(
          client,
          'calendar_dates.txt',
          GtfsParserService.COLS_CALENDAR_DATES,
          'gtfs_calendar_dates_next',
          (c, idx) =>
            GtfsParserService.COLS_CALENDAR_DATES.map((h) => c[idx[h]]),
        );

        // Stops avec filtre bbox → construit validStopIds en même temps.
        const PARIS_LAT = 48.8566;
        const PARIS_LON = 2.3522;
        const validStopIds = new Set<string>();
        let stopsKept = 0;
        await this.streamCopy(
          client,
          'stops.txt',
          GtfsParserService.COLS_STOPS,
          'gtfs_stops_next',
          (cols, idx) => {
            const lat = parseFloat(cols[idx['stop_lat']]);
            const lon = parseFloat(cols[idx['stop_lon']]);
            if (isNaN(lat) || isNaN(lon)) return null; // arrêt sans coords → écarté
            const distance = this.haversineKm(lat, lon, PARIS_LAT, PARIS_LON);
            if (distance > radiusKm) return null; // hors bbox
            validStopIds.add(cols[idx['stop_id']]);
            stopsKept++;
            // COLS_STOPS sauf la dernière colonne (stop_name_norm) vient du CSV ;
            // stop_name_norm est calculée côté Node (unaccent non-immutable).
            const row = GtfsParserService.COLS_STOPS.slice(0, -1).map(
              (h) => cols[idx[h]],
            );
            row.push(this.normalizeForSearch(cols[idx['stop_name']] ?? ''));
            return row;
          },
        );
        this.logger.log(
          `Bounding-box filter: ${stopsKept} stops kept (≤${radiusKm} km from Paris)`,
        );

        // stop_times avec filtre bbox par stop_id (fichier massif ~14M lignes).
        await this.streamCopy(
          client,
          'stop_times.txt',
          GtfsParserService.COLS_STOP_TIMES,
          'gtfs_stop_times_next',
          (cols, idx) =>
            validStopIds.has(cols[idx['stop_id']])
              ? GtfsParserService.COLS_STOP_TIMES.map((h) => cols[idx[h]])
              : null,
          'stop_times',
        );

        // transfers filtrés (les deux extrémités dans la bbox).
        await this.streamCopy(
          client,
          'transfers.txt',
          GtfsParserService.COLS_TRANSFERS,
          'gtfs_transfers_next',
          (cols, idx) =>
            validStopIds.has(cols[idx['from_stop_id']]) &&
            validStopIds.has(cols[idx['to_stop_id']])
              ? GtfsParserService.COLS_TRANSFERS.map((h) => cols[idx[h]])
              : null,
        );

        // PK sur le staging AVANT les agrégats : buildStopAggregates utilise
        // ON CONFLICT (stop_id, mode) / (stop_id, mode, name) qui exige les PK
        // sur gtfs_stop_modes_next / gtfs_stop_lines_lines. Les PK sur les
        // tables chargées (stops/trips/routes…) accélèrent aussi les JOIN des
        // agrégats. Index secondaires + comptes + bascule atomique ensuite.
        // Sur erreur → cleanupStaging() dans le catch externe : live intact.
        await this.gtfsDb.addStagingPrimaryKeys();
        await this.gtfsDb.buildStopAggregates('_next');
        await this.gtfsDb.createStagingIndexes();
        const counts = await this.gtfsDb.computeCounts('_next');
        await this.gtfsDb.swapAndFinalize(counts);

        const meta = await this.gtfsDb.getMeta();
        const elapsed = Date.now() - startTime;
        this.logger.log(
          `GTFS data loaded in ${elapsed}ms — ` +
            `${meta?.stops ?? 0} stops, ${meta?.routes ?? 0} routes, ${meta?.trips ?? 0} trips, ${meta?.stop_times ?? 0} stop_times`,
        );
      } finally {
        client.release();
      }
    } catch (error) {
      // Rechargement atomique échoué : on nettoie le staging résiduel. Les
      // tables live restent intactes (la bascule a été roulée back ou n'a jamais
      // eu lieu) et loaded reste TRUE → aucun 503, aucune perte de données.
      try {
        await this.gtfsDb.cleanupStaging();
      } catch (cleanupErr) {
        this.logger.warn(
          `cleanupStaging failed (ignored): ${cleanupErr instanceof Error ? cleanupErr.message : cleanupErr}`,
        );
      }
      this.logger.error(
        `Failed to load GTFS data: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Stream un fichier GTFS CSV → COPY dans une table, ligne par ligne (faible
   * empreinte mémoire). `pickRow` reçoit (cols, headerIdx) et retourne soit
   * le tableau des champs dans l'ordre des colonnes cibles, soit null pour
   * écarter la ligne (filtre bbox). Gère le backpressure vers le flux COPY.
   */
  private async streamCopy(
    client: Parameters<GtfsDbService['copyFromStream']>[0],
    fileName: string,
    targetCols: string[],
    table: string,
    pickRow: (
      cols: string[],
      headerIdx: Record<string, number>,
    ) => string[] | null,
    progressName?: string,
  ): Promise<void> {
    const filePath = path.join(this.dataDir, 'extracted', fileName);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`GTFS file not found: ${filePath}`);
      return;
    }

    const colList = targetCols.join(', ');
    const copySql = `COPY ${table}(${colList}) FROM STDIN WITH (FORMAT csv, HEADER false, NULL '')`;
    const ingest = this.gtfsDb.copyFromStream(client, copySql);
    // Le writeLine fire-and-forget peut empiler des listeners 'drain' (un par
    // écriture en backpressure) au-delà du seuil de 10 → warning fuite. Les
    // listeners 'once' se retirent seuls après déclenchement (pas de vraie
    // fuite), on relève juste le seuil pour couvrir les grosses tables.
    (ingest as any).setMaxListeners?.(0);

    const headerIdx: Record<string, number> = {};
    let headerParsed = false;
    let scanned = 0;
    let kept = 0;
    let lastProgress = 0;
    let lastDrain = 0;

    const writeLine = async (line: string): Promise<void> => {
      const ok = (ingest as any).write(line + '\n');
      if (!ok) {
        await new Promise<void>((resolve) =>
          (ingest as any).once('drain', resolve),
        );
        lastDrain = scanned;
      }
    };

    await new Promise<void>((resolve, reject) => {
      (ingest as any).on('error', reject);
      (ingest as any).on('finish', resolve);

      const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
      });

      rl.on('line', async (rawLine: string) => {
        const line = rawLine.trim();
        if (!line) return;

        if (!headerParsed) {
          headerParsed = true;
          const headers = line
            .split(',')
            .map((h) => h.trim().replace(/"/g, ''));
          headers.forEach((h, i) => (headerIdx[h] = i));
          return;
        }

        scanned++;
        const cols = this.parseCsvLine(line);
        const out = pickRow(cols, headerIdx);
        if (out) {
          kept++;
          const csvLine = out.map((v) => this.csvEscape(v)).join(',');
          void writeLine(csvLine);
        }

        // Progression + cession de l'event loop (fichiers massifs).
        if (progressName && scanned - lastProgress >= 1_000_000) {
          lastProgress = scanned;
          this.logger.log(
            `${progressName}: ${scanned.toLocaleString('fr-FR')} lignes parcourues, ` +
              `${kept.toLocaleString('fr-FR')} conservées…`,
          );
        }
        if (scanned - lastDrain >= 50_000) {
          lastDrain = scanned;
          // Cède la main pour ne pas bloquer l'event loop (API + app.listen)
          // et laisser PG drainer le flux COPY.
          await new Promise<void>((r) => setImmediate(r));
        }
      });

      rl.on('close', () => {
        (ingest as any).end();
        if (progressName) {
          this.logger.log(
            `${progressName}: ${scanned.toLocaleString('fr-FR')} lignes parcourues, ` +
              `${kept.toLocaleString('fr-FR')} conservées (terminé).`,
          );
        }
      });
      rl.on('error', reject);
    });
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
   * Échappe une valeur pour COPY en mode CSV. Une valeur vide/non définie → ''
   * (champ vide non quoté → NULL avec NULL ''). Sinon, quoting standard RFC 4180.
   */
  private csvEscape(value: string | undefined | null): string {
    if (value == null || value === '') return '';
    if (/[",\n\r]/.test(value)) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  // ─── Méta de chargement (isLoaded / getStats / getLastLoadTime) ───

  /** Vérifie si les données GTFS sont chargées en base (cache 5 s côté GtfsDbService). */
  async isLoaded(): Promise<boolean> {
    return this.gtfsDb.isLoaded();
  }

  /** Date du dernier chargement. */
  async getLastLoadTime(): Promise<Date | null> {
    return (await this.gtfsDb.getMeta())?.last_load_time ?? null;
  }

  /** Statistiques filtrées (parité avec l'ancien index en mémoire). */
  async getStats(): Promise<{
    stops: number;
    routes: number;
    trips: number;
    agencies: number;
  } | null> {
    const meta = await this.gtfsDb.getMeta();
    if (!meta) return null;
    return {
      stops: meta.stops,
      routes: meta.routes,
      trips: meta.trips,
      agencies: meta.agencies,
    };
  }

  // ─── Lectures (délèguent à GtfsDbService) ────────────────────────────

  /**
   * Recherche d'arrêts par nom (insensible casse/accents). Les quais sont
   * regroupés sous leur gare parente (voir GtfsDbService.searchStopsByName).
   */
  async searchStopsByName(query: string, limit = 20): Promise<GtfsStop[]> {
    const normalizedQuery = this.normalizeForSearch(query);
    if (!normalizedQuery) return [];
    return this.gtfsDb.searchStopsByName(normalizedQuery, limit);
  }

  /**
   * Modes (route_type GTFS) desservant un arrêt, triés par priorité
   * (train > métro > tram > bus > autres). Tableau vide si arrêt inconnu.
   */
  async getStopModes(stopId: string): Promise<number[]> {
    const modes = await this.gtfsDb.getStopModes(stopId);
    return modes.sort(routeTypePriority);
  }

  /**
   * Lignes desservant un arrêt, triées par priorité de mode puis par nom.
   */
  async getStopLines(
    stopId: string,
  ): Promise<{ mode: number; name: string }[]> {
    const lines = await this.gtfsDb.getStopLines(stopId);
    return lines.sort(
      (a, b) =>
        routeTypePriority(a.mode, b.mode) || a.name.localeCompare(b.name),
    );
  }

  /**
   * Recherche des arrêts à proximité (dans un rayon donné).
   * Si la position est trop éloignée de Paris (> 30km), retourne vide immédiatement.
   */
  async findStopsNearby(
    lat: number,
    lon: number,
    radiusKm = 0.5,
    limit = 8,
  ): Promise<GtfsStop[]> {
    // Vérifier rapidement si la position est dans la région parisienne
    const distanceFromParis = this.haversineKm(lat, lon, 48.8566, 2.3522);
    if (distanceFromParis > 30) {
      return []; // Hors Île-de-France — aucun arrêt disponible
    }

    // Bbox carrée autour du point (le filtre haversine circulaire final est en Node).
    const latDeg = radiusKm / 111;
    const lonDeg = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
    const candidates = await this.gtfsDb.findStopsNearbyBbox(
      lat - latDeg,
      lat + latDeg,
      lon - lonDeg,
      lon + lonDeg,
    );

    // 1. Quais embarquables (location_type=0) dans le rayon, par distance.
    //    On ignore les stations parentes (1) et les entrées/sorties (2) qui
    //    n'ont aucun stop_time et saturent inutilement le limit.
    const nearbyPlatforms: { stop: GtfsStop; distance: number }[] = [];
    for (const stop of candidates) {
      if (stop.location_type !== 0) continue;
      const distance = this.haversineKm(lat, lon, stop.stop_lat, stop.stop_lon);
      if (distance <= radiusKm) nearbyPlatforms.push({ stop, distance });
    }
    nearbyPlatforms.sort((a, b) => a.distance - b.distance);

    // 2. Expansion par gare : pour chaque station parente représentée dans le
    //    rayon, exposer TOUS ses quais (métro/RER/bus) — sinon le limit coupe
    //    les quais d'une ligne dont le quai est au-delà des N plus proches.
    //    Ex : à Gare du Nord, le quai métro 4 (IDFM:22149) est noyé sous les
    //    entrées/alias sans stop_times ; sans expansion, RAPTOR ne voit que le
    //    bus. L'expansion garantit que toutes les lignes de la gare snapée
    //    sont interrogées.
    const parentIds = new Set<string>();
    for (const p of nearbyPlatforms) {
      if (p.stop.parent_station) parentIds.add(p.stop.parent_station);
    }
    const expanded = await this.gtfsDb.findPlatformsByParentStations([
      ...parentIds,
    ]);

    // 3. Union : quais expandés + quais standalone (bus de rue sans parent).
    const result = new Map<string, GtfsStop>();
    for (const p of nearbyPlatforms) {
      if (!p.stop.parent_station) result.set(p.stop.stop_id, p.stop);
    }
    for (const s of expanded) result.set(s.stop_id, s);

    // 4. Tri par distance au point demandé, puis limite.
    const all = [...result.values()].map((stop) => ({
      stop,
      distance: this.haversineKm(lat, lon, stop.stop_lat, stop.stop_lon),
    }));
    all.sort((a, b) => a.distance - b.distance);
    return all.slice(0, limit).map((r) => r.stop);
  }

  /** Lignes desservant un arrêt (distinct sur route). */
  async getRoutesForStop(stopId: string): Promise<GtfsRoute[]> {
    return this.gtfsDb.getRoutesForStop(stopId);
  }

  /**
   * Prochains départs d'un arrêt >= timeAfter. Over-fetch configurable
   * (GTFS_DEPARTURE_OVERFETCH, default 10) pour le RAPTOR (filtrage service +
   * dédup par route côté journey).
   */
  async getNextDepartures(
    stopId: string,
    timeAfter: string, // HH:MM:SS
    limit = 10,
  ): Promise<{ trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[]> {
    const overfetch = parseInt(
      process.env.GTFS_DEPARTURE_OVERFETCH || '10',
      10,
    );
    return this.gtfsDb.getNextDepartures(
      stopId,
      this.timeToSeconds(timeAfter),
      limit,
      overfetch,
    );
  }

  /**
   * Prochains départs pour un ensemble d'arrêts en UNE requête (batch RAPTOR),
   * avec un seuil horaire **per-stop** (`minDepSecondsArr[i]` = bestArrival du
   * stop `stopIds[i]`). Délègue à gtfsDb (LATERAL + LIMIT par stop).
   */
  async getNextDeparturesBatch(
    stopIds: string[],
    minDepSecondsArr: number[],
    activeServiceIds: string[],
    limit: number,
  ): Promise<Map<string, { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[]>> {
    return this.gtfsDb.getNextDeparturesBatch(
      stopIds,
      minDepSecondsArr,
      activeServiceIds,
      limit,
    );
  }

  /**
   * Prochains départs pour aujourd'hui, filtrés par services actifs
   * (service_id valide aujourd'hui), dédoublonnés par (ligne + headsign).
   */
  async getStopDepartures(
    stopId: string,
    date: Date,
    limit = 5,
  ): Promise<
    Array<{
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
    }>
  > {
    const activeServiceIds = await this.getActiveServiceIds(date);
    const nowSeconds = this.timeToSeconds(this.formatTime(date));
    const deps = await this.gtfsDb.getStopDepartures(
      stopId,
      nowSeconds,
      [...activeServiceIds],
      limit,
    );

    // Dédoublonner par (lineName + headsign) et garder le plus proche.
    const seen = new Map<string, (typeof deps)[0]>();
    for (const dep of deps) {
      const key = `${dep.lineName}|${dep.headsign}`;
      if (!seen.has(key) || dep.waitMinutes < seen.get(key)!.waitMinutes) {
        seen.set(key, dep);
      }
    }
    return Array.from(seen.values())
      .sort((a, b) => a.waitMinutes - b.waitMinutes)
      .slice(0, limit);
  }

  /** Services actifs pour une date (calendrier + exceptions). */
  async getActiveServiceIds(date: Date): Promise<Set<string>> {
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ...
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const dateNum = parseInt(dateStr);
    return this.gtfsDb.getActiveServiceIds(dateNum, dayOfWeek, dateStr);
  }

  /** Horaires d'une course triés par séquence (marche de trip RAPTOR). */
  async getTripStopTimes(tripId: string): Promise<GtfsStopTime[]> {
    return this.gtfsDb.getTripStopTimes(tripId);
  }

  /** Stop_times d'un ensemble de courses en UNE requête (batch RAPTOR). */
  async getTripStopTimesBatch(
    tripIds: string[],
  ): Promise<Map<string, GtfsStopTime[]>> {
    return this.gtfsDb.getTripStopTimesBatch(tripIds);
  }

  /** Correspondances à pied depuis un arrêt (foot-paths RAPTOR). */
  async getTransfersFrom(
    stopId: string,
  ): Promise<{ to_stop_id: string; min_transfer_time: number | null }[]> {
    return this.gtfsDb.getTransfersFrom(stopId);
  }

  /** Correspondances à pied depuis un ensemble d'arrêts (batch RAPTOR). */
  async getTransfersFromBatch(
    stopIds: string[],
  ): Promise<Map<string, { to_stop_id: string; min_transfer_time: number | null }[]>> {
    return this.gtfsDb.getTransfersFromBatch(stopIds);
  }

  /** Coordonnées d'un ensemble d'arrêts (pour estimateTransitDistance). */
  async getStopCoordsByIds(
    stopIds: string[],
  ): Promise<Map<string, { lat: number; lon: number }>> {
    return this.gtfsDb.getStopCoordsByIds(stopIds);
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
    const rl = readline.createInterface({
      input: fs.createReadStream(shapesPath),
    });
    let headers: string[] | null = null;

    for await (const line of rl) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      if (!headers) {
        headers = cols;
        continue;
      }
      const get = (name: string) =>
        cols[headers!.indexOf(name)]?.replace(/^"|"$/g, '') || '';
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

  // ─── Utilitaires ─────────────────────────────────────────────────────

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
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  /** Format a date as HH:MM:SS (heure locale). */
  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /** Distance haversine entre deux points GPS (en km). */
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

  /** Convertit un temps GTFS "HH:MM:SS" en secondes depuis minuit. */
  private timeToSeconds(time: string): number {
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
}

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

/** Tri des modes (train > métro > tram > bus > autres). */
export function routeTypePriority(a: number, b: number): number {
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
