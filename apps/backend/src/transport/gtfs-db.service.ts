import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import type {
  GtfsRoute,
  GtfsStop,
  GtfsStopTime,
  GtfsTrip,
} from './gtfs-parser.service';

/**
 * GtfsDbService — accès SQL brut à PostgreSQL pour les données GTFS statiques.
 *
 * Pourquoi un pool `pg` brut et non TypeORM :
 *  - Le chargement en masse utilise `COPY ... FROM STDIN` (pg-copy-streams),
 *    impossible via TypeORM sans passer par le driver sous-jacent.
 *  - Les lectures paramétrées du moteur RAPTOR (getNextDepartures, marche de
 *    trip…) sont des requêtes simples ; un pool dédié évite l'overhead du
 *    QueryBuilder par round-trip (le RAPTOR en émet des dizaines par requête).
 *  - TypeORM reste utilisé pour les entités métier (users/favorites…).
 *
 * Les tables `gtfs_*` n'ont AUCUNE entité TypeORM : `synchronize:true` (dev)
 * ne les touche donc pas. Le schéma est créé par `docker/init-db.sql` au
 * premier démarrage et auto-guéri par `ensureSchema()` (CREATE … IF NOT EXISTS).
 *
 * Les ~6,8 M stop_times vivent en base : Node ne conserve rien en mémoire,
 * ce qui élimine l'OOM (2-3 Go de heap) sur la VM Docker 3,8 Go.
 */
@Injectable()
export class GtfsDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GtfsDbService.name);
  private pool: Pool | null = null;

  /**
   * Tables de données GTFS swappées lors d'un rechargement atomique
   * (staging `*_next` → bascule RENAME → live). `gtfs_load_meta` est exclue :
   * table singleton hors-bascule, mise à jour dans la transaction finale.
   * L'ordre correspond à l'ordre de COPY dans `loadFromZip` (aucune dépendance
   * entre tables au chargement, mais gardé stable pour la lisibilité).
   */
  private static readonly GTFS_TABLES = [
    'gtfs_agencies',
    'gtfs_routes',
    'gtfs_stops',
    'gtfs_trips',
    'gtfs_stop_times',
    'gtfs_calendar',
    'gtfs_calendar_dates',
    'gtfs_transfers',
    'gtfs_stop_modes',
    'gtfs_stop_lines',
  ] as const;

  /**
   * Index secondaires GTFS. Source unique partagée entre `ensureSchema`
   * (création sur les tables live, noms canoniques) et le chemin de
   * rechargement atomique (`createStagingIndexes` sur `*_next` puis
   * `ALTER INDEX ... RENAME TO` canonique lors de la bascule). Évite la
   * dérive entre les deux chemins et les index dupliqués.
   */
  private static readonly GTFS_INDEXES: ReadonlyArray<{
    name: string;
    table: string;
    expr: string;
  }> = [
    {
      name: 'idx_gtfs_st_stop_departure',
      table: 'gtfs_stop_times',
      expr: 'stop_id, departure_seconds',
    },
    {
      name: 'idx_gtfs_st_stop_arrival',
      table: 'gtfs_stop_times',
      expr: 'stop_id, arrival_seconds',
    },
    {
      name: 'idx_gtfs_st_trip_sequence',
      table: 'gtfs_stop_times',
      expr: 'trip_id, stop_sequence',
    },
    { name: 'idx_gtfs_trips_route', table: 'gtfs_trips', expr: 'route_id' },
    { name: 'idx_gtfs_trips_service', table: 'gtfs_trips', expr: 'service_id' },
    {
      name: 'idx_gtfs_stops_parent',
      table: 'gtfs_stops',
      expr: 'parent_station',
    },
    {
      name: 'idx_gtfs_stops_coords',
      table: 'gtfs_stops',
      expr: 'stop_lat, stop_lon',
    },
    {
      name: 'idx_gtfs_stops_name_norm',
      table: 'gtfs_stops',
      expr: 'stop_name_norm',
    },
    {
      name: 'idx_gtfs_transfers_from',
      table: 'gtfs_transfers',
      expr: 'from_stop_id',
    },
    {
      name: 'idx_gtfs_caldates_date',
      table: 'gtfs_calendar_dates',
      expr: 'date',
    },
    {
      name: 'idx_gtfs_caldates_service',
      table: 'gtfs_calendar_dates',
      expr: 'service_id',
    },
  ];

  /**
   * Clés primaires des tables GTFS. `LIKE … INCLUDING CONSTRAINTS` (sans
   * `INCLUDING INDEXES`) ne copie PAS les PK/UNIQUE en PostgreSQL — seulement
   * CHECK/NOT NULL. Il faut donc recréer explicitement les PK sur le staging,
   * sinon la bascule ferait perdre aux tables live leur PK (régression perf
   * sur les lookups par stop_id + perte d'intégrité). `gtfs_stop_times` et
   * `gtfs_transfers` n'ont pas de PK (volumétrie / pas de clé naturelle).
   *
   * `name` = nom canonique PG par défaut (`<table>_pkey`) ; le staging utilise
   * `${name}_next`, renommé en `${name}` lors de la bascule (nom libéré par le
   * DROP de `_old`). Cohérent sur tous les cycles (pas de collision de nom).
   */
  private static readonly GTFS_PK: ReadonlyArray<{
    table: string;
    cols: string;
    name: string;
  }> = [
    { table: 'gtfs_agencies', cols: 'agency_id', name: 'gtfs_agencies_pkey' },
    { table: 'gtfs_routes', cols: 'route_id', name: 'gtfs_routes_pkey' },
    { table: 'gtfs_stops', cols: 'stop_id', name: 'gtfs_stops_pkey' },
    { table: 'gtfs_trips', cols: 'trip_id', name: 'gtfs_trips_pkey' },
    { table: 'gtfs_calendar', cols: 'service_id', name: 'gtfs_calendar_pkey' },
    {
      table: 'gtfs_calendar_dates',
      cols: 'service_id, date',
      name: 'gtfs_calendar_dates_pkey',
    },
    {
      table: 'gtfs_stop_modes',
      cols: 'stop_id, mode',
      name: 'gtfs_stop_modes_pkey',
    },
    {
      table: 'gtfs_stop_lines',
      cols: 'stop_id, mode, name',
      name: 'gtfs_stop_lines_pkey',
    },
  ];

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url =
      this.configService.get<string>('DATABASE_URL') ||
      'postgresql://urbanflow:urbanflow_dev@localhost:5432/urbanflow';
    this.pool = new Pool({
      connectionString: url,
      max: parseInt(process.env.GTFS_PG_POOL_MAX || '20', 10),
    });
    try {
      const res = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
      if (res.rows[0]?.ok === 1) {
        this.logger.log('PostgreSQL connection OK for GTFS store.');
      }
      await this.ensureSchema();
      // Préchauffe fire-and-forget : charge gtfs_stop_times (+ index) en
      // shared_buffers si le GTFS est déjà chargé. Évite que le 1er journey
      // ne lise la table (~923 Mo) depuis le disque. Sans effet si non chargé
      // (le chargement complet préchauffera de lui-même via ses COPY/RENAME).
      if (await this.isLoaded()) {
        void this.prewarmHotTables();
      }
    } catch (err) {
      this.logger.error(
        `GTFS PG pool init failed: ${err instanceof Error ? err.message : err}. ` +
          `Les endpoints GTFS resteront indisponibles tant que PG ne répond pas.`,
      );
    }
  }

  /**
   * Préchauffe les tables chaudes du RAPTOR (gtfs_stop_times + index trip) dans
   * shared_buffers via l'extension pg_prewarm. Idempotent. Sans effet si
   * l'extension n'est pas disponible (logging seul). Appelé au démarrage si le
   * GTFS est déjà chargé, et après chaque reload atomique (swapAndFinalize).
   */
  async prewarmHotTables(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.query('CREATE EXTENSION IF NOT EXISTS pg_prewarm;');
      // Heap (main fork) + indexes chauds du RAPTOR. Sans préchauffer les index,
      // le 1er journey paie les lectures aléatoires d'index (LATERAL par stop +
      // bitmap trip) depuis le disque (~14 s sur le round 2 à 6074 stops).
      const targets = [
        'gtfs_stop_times',
        'idx_gtfs_st_stop_departure',
        'idx_gtfs_st_trip_sequence',
      ];
      let totalBlocks = 0;
      for (const rel of targets) {
        const r = await this.query<{ p: string }>(
          `SELECT pg_prewarm($1::regclass, 'buffer', 'main') AS p;`,
          [rel],
        );
        totalBlocks += parseInt(r.rows[0]?.p ?? '0', 10);
      }
      this.logger.log(
        `Préchauffé ${targets.length} relations RAPTOR en shared_buffers (${totalBlocks} blocs, ~${Math.round((totalBlocks * 8) / 1024)} Mo).`,
      );
    } catch (err) {
      this.logger.warn(
        `pg_prewarm indisponible ou échec préchauffage : ${err instanceof Error ? err.message : err}. ` +
          `Le 1er journey sera plus lent (lecture disque).`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  getPool(): Pool {
    if (!this.pool) throw new Error('GtfsDbService pool not initialized');
    return this.pool;
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) throw new Error('GtfsDbService pool not initialized');
    return this.pool.connect();
  }

  /** Exécute une requête paramétrée. */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    if (!this.pool) throw new Error('GtfsDbService pool not initialized');
    return this.pool.query<T>(text, params as unknown[]);
  }

  /**
   * Crée un flux d'ingestion COPY lié à un client dédié. L'appelant pipe
   * les lignes CSV (sans en-tête) dans le flux retourné, puis attend 'finish'.
   * Usage : `const ingest = db.copyFromStream(client, 'COPY t(c1,c2) FROM STDIN WITH (FORMAT csv, HEADER false)');`
   */
  copyFromStream(client: PoolClient, copySql: string): NodeJS.WritableStream {
    return client.query(
      copyFrom(copySql) as unknown as Parameters<PoolClient['query']>[0],
    ) as unknown as NodeJS.WritableStream;
  }

  /**
   * Crée le schéma GTFS s'il n'existe pas (idempotent). Reflète
   * `docker/init-db.sql` afin que l'application auto-guérisse en dev même si
   * le script d'init n'a pas tourné (ex. base existante sans tables gtfs_*).
   */
  async ensureSchema(): Promise<void> {
    if (!this.pool) throw new Error('GtfsDbService pool not initialized');
    const ddl = [
      // NB : l'extension `unaccent` n'est PAS nécessaire — la recherche
      // insensible aux accents repose sur la colonne `stop_name_norm` (plain
      // TEXT) peuplée côté Node via normalizeForSearch(). On évite ainsi
      // CREATE EXTENSION (qui levait un duplicate_key sur pg_extension /
      // pg_type dans certains états de l'image alpine) et toute dépendance
      // superuser au runtime.
      `CREATE TABLE IF NOT EXISTS gtfs_agencies (
        agency_id TEXT PRIMARY KEY, agency_name TEXT, agency_url TEXT,
        agency_timezone TEXT, agency_lang TEXT, agency_phone TEXT,
        agency_fare_url TEXT, agency_email TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_routes (
        route_id TEXT PRIMARY KEY, agency_id TEXT, route_short_name TEXT,
        route_long_name TEXT, route_desc TEXT, route_type SMALLINT,
        route_url TEXT, route_color TEXT, route_text_color TEXT, route_sort_order INTEGER
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_stops (
        stop_id TEXT PRIMARY KEY, stop_code TEXT, stop_name TEXT NOT NULL,
        stop_desc TEXT, stop_lat DOUBLE PRECISION NOT NULL, stop_lon DOUBLE PRECISION NOT NULL,
        location_type SMALLINT, parent_station TEXT, stop_timezone TEXT,
        wheelchair_boarding SMALLINT, platform_code TEXT,
        stop_name_norm TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_trips (
        trip_id TEXT PRIMARY KEY, route_id TEXT NOT NULL, service_id TEXT NOT NULL,
        trip_headsign TEXT, trip_short_name TEXT, direction_id SMALLINT,
        shape_id TEXT, wheelchair_accessible SMALLINT, bikes_allowed SMALLINT
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_stop_times (
        trip_id TEXT NOT NULL, arrival_time TEXT NOT NULL, departure_time TEXT NOT NULL,
        stop_id TEXT NOT NULL, stop_sequence INTEGER NOT NULL, stop_headsign TEXT,
        pickup_type SMALLINT, drop_off_type SMALLINT, shape_dist_traveled DOUBLE PRECISION,
        timepoint SMALLINT,
        arrival_seconds INTEGER GENERATED ALWAYS AS (
          (split_part(arrival_time, ':', 1))::int * 3600 +
          (split_part(arrival_time, ':', 2))::int * 60 +
          COALESCE((split_part(arrival_time, ':', 3))::int, 0)
        ) STORED,
        departure_seconds INTEGER GENERATED ALWAYS AS (
          (split_part(departure_time, ':', 1))::int * 3600 +
          (split_part(departure_time, ':', 2))::int * 60 +
          COALESCE((split_part(departure_time, ':', 3))::int, 0)
        ) STORED
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_calendar (
        service_id TEXT PRIMARY KEY,
        monday SMALLINT, tuesday SMALLINT, wednesday SMALLINT, thursday SMALLINT,
        friday SMALLINT, saturday SMALLINT, sunday SMALLINT,
        start_date TEXT, end_date TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_calendar_dates (
        service_id TEXT NOT NULL, date TEXT NOT NULL, exception_type SMALLINT NOT NULL,
        PRIMARY KEY (service_id, date)
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_transfers (
        from_stop_id TEXT NOT NULL, to_stop_id TEXT NOT NULL,
        transfer_type SMALLINT, min_transfer_time INTEGER
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_stop_modes (
        stop_id TEXT NOT NULL, mode SMALLINT NOT NULL, PRIMARY KEY (stop_id, mode)
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_stop_lines (
        stop_id TEXT NOT NULL, mode SMALLINT NOT NULL, name TEXT NOT NULL,
        PRIMARY KEY (stop_id, mode, name)
      );`,
      `CREATE TABLE IF NOT EXISTS gtfs_load_meta (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CONSTRAINT gtfs_load_meta_singleton CHECK (id = TRUE),
        loaded BOOLEAN NOT NULL DEFAULT FALSE, last_load_time TIMESTAMPTZ,
        stops INTEGER, routes INTEGER, trips INTEGER, agencies INTEGER, stop_times INTEGER
      );`,
    ];
    for (const stmt of ddl) {
      await this.pool.query(stmt);
    }
    // Index secondaires (source unique : GTFS_INDEXES, partagée avec le chemin
    // de rechargement atomique afin d'éviter la dérive et les index dupliqués).
    for (const idx of GtfsDbService.GTFS_INDEXES) {
      await this.pool.query(
        `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.expr});`,
      );
    }
    // Ligne de méta singleton (pour isLoaded/getMeta avant tout chargement).
    await this.pool.query(
      `INSERT INTO gtfs_load_meta(id, loaded) VALUES (TRUE, FALSE) ON CONFLICT (id) DO NOTHING;`,
    );
  }

  // ─── Chargement (loader) — rechargement atomique zero-downtime ───────
  //
  // Principe : on charge le nouveau GTFS dans des tables *staging* `gtfs_*_next`
  // pendant que les lectures continuent sur les tables live `gtfs_*` (loaded
  // reste TRUE, aucun 503, aucun lock sur les tables live). Une fois le staging
  // complet + indexé, une transaction unique renomme les tables live → `*_old`,
  // les staging → live, drop les `*_old`, renomme les index en noms canoniques,
  // et valide les comptes dans `gtfs_load_meta`. En cas d'échec avant ou pendant
  // la bascule, les tables live restent intactes (ROLLBACK de la tx, ou cleanup
  // du staging) → aucune perte de données, aucune interruption.

  /**
   * Prépare les tables staging pour un rechargement atomique.
   * Drop d'éventuelles tables `_next`/`_old` résiduelles (rattrape un crash
   * d'un load précédent), puis crée chaque `gtfs_*_next` clonée depuis la live
   * (`LIKE … INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED` —
   * colonnes + PK + colonnes générées, SANS index : COPY plus rapide, les index
   * sont créés après COPY par `createStagingIndexes`).
   *
   * NB : au tout premier boot (base vide), `ensureSchema()` a déjà créé les
   * tables live (vides) → le clonage fonctionne ; la bascule renommera des
   * tables vides en `_old` puis les droppera.
   */
  async prepareStaging(): Promise<void> {
    for (const t of GtfsDbService.GTFS_TABLES) {
      // CASCADE : les vues/index éventuels sur le staging précédent partent.
      await this.query(`DROP TABLE IF EXISTS ${t}_next CASCADE;`);
      await this.query(`DROP TABLE IF EXISTS ${t}_old CASCADE;`);
      // INCLUDING INDEXES volontairement omis : COPY sur table non indexée,
      // index créés post-COPY par createStagingIndexes().
      await this.query(
        `CREATE TABLE ${t}_next (LIKE ${t} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED);`,
      );
    }
  }

  /**
   * Crée les index secondaires sur les tables staging (`*_next`), avec des
   * noms suffixés `_next`. Noms canoniques restaurés lors de la bascule par
   * `swapAndFinalize` (`ALTER INDEX … RENAME TO`) → pas d'index dupliqué,
   * `ensureSchema` reste idempotent au cycle suivant.
   */
  async createStagingIndexes(): Promise<void> {
    for (const idx of GtfsDbService.GTFS_INDEXES) {
      await this.query(
        `CREATE INDEX IF NOT EXISTS ${idx.name}_next ON ${idx.table}_next(${idx.expr});`,
      );
    }
  }

  /**
   * Recrée les clés primaires sur le staging. `LIKE … INCLUDING CONSTRAINTS`
   * ne copie pas les PK (voir GTFS_PK) : sans cette étape, la bascule ferait
   * perdre aux tables live leur PK. À appeler après le COPY (table pleine) :
   * build d'index unique, coût similaire aux index secondaires.
   * Noms `${name}_next` → renommés en `${name}` (canonique) lors de la bascule.
   */
  async addStagingPrimaryKeys(): Promise<void> {
    for (const pk of GtfsDbService.GTFS_PK) {
      await this.query(
        `ALTER TABLE ${pk.table}_next ADD CONSTRAINT ${pk.name}_next PRIMARY KEY (${pk.cols});`,
      );
    }
  }

  /**
   * Nettoyage du staging après échec : drop les tables `_next` (et `_old` par
   * sécurité). Les tables live restent intactes, `loaded` reste TRUE.
   */
  async cleanupStaging(): Promise<void> {
    for (const t of GtfsDbService.GTFS_TABLES) {
      await this.query(`DROP TABLE IF EXISTS ${t}_next CASCADE;`);
      await this.query(`DROP TABLE IF EXISTS ${t}_old CASCADE;`);
    }
  }

  /**
   * Bascule atomique : en UNE transaction, les tables staging deviennent live,
   * les anciennes live sont droppées, les index renommés en noms canoniques,
   * et `gtfs_load_meta` est validé. Toute erreur → ROLLBACK → live intact.
   *
   * `counts` est pré-calculé depuis le staging (computeCounts('_next')) avant
   * la bascule pour éviter des lectures sur les tables en cours de renommage.
   */
  async swapAndFinalize(counts: {
    stops: number;
    routes: number;
    trips: number;
    agencies: number;
    stop_times: number;
  }): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      // 1. Live → _old, puis staging → live, pour chaque table.
      for (const t of GtfsDbService.GTFS_TABLES) {
        await client.query(`ALTER TABLE ${t} RENAME TO ${t}_old;`);
        await client.query(`ALTER TABLE ${t}_next RENAME TO ${t};`);
      }
      // 2. Drop des anciennes live (libère les noms d'index canoniques).
      for (const t of GtfsDbService.GTFS_TABLES) {
        await client.query(`DROP TABLE ${t}_old;`);
      }
      // 3. Index staging (noms `_next`) → noms canoniques (instantané, métadonnée).
      for (const idx of GtfsDbService.GTFS_INDEXES) {
        await client.query(
          `ALTER INDEX ${idx.name}_next RENAME TO ${idx.name};`,
        );
      }
      // 3bis. PK staging (contraintes `${name}_next`) → noms canoniques.
      for (const pk of GtfsDbService.GTFS_PK) {
        await client.query(
          `ALTER TABLE ${pk.table} RENAME CONSTRAINT ${pk.name}_next TO ${pk.name};`,
        );
      }
      // 4. Validation des comptes + loaded=TRUE dans la même tx.
      await client.query(
        `UPDATE gtfs_load_meta
         SET loaded = TRUE, last_load_time = NOW(),
             stops = $1, routes = $2, trips = $3, agencies = $4, stop_times = $5
         WHERE id = TRUE;`,
        [
          counts.stops,
          counts.routes,
          counts.trips,
          counts.agencies,
          counts.stop_times,
        ],
      );
      await client.query('COMMIT');
      this.invalidateLoadedCache();
      // Re-préchauffera la nouvelle table (swap RENAME → nouveau gtfs_stop_times).
      void this.prewarmHotTables();
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* rollback best-effort */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Agrège les modes et lignes par arrêt (quai + gare parente) — équivalent
   * SQL de buildStopModes(). INSERT…SELECT depuis stop_times JOIN trips/routes.
   * `suffix` cible les tables staging (`_next`) lors d'un rechargement atomique ;
   * par défaut '' → tables live.
   */
  async buildStopAggregates(suffix = ''): Promise<void> {
    const stt = `gtfs_stop_times${suffix}`;
    const trips = `gtfs_trips${suffix}`;
    const routes = `gtfs_routes${suffix}`;
    const stops = `gtfs_stops${suffix}`;
    const modes = `gtfs_stop_modes${suffix}`;
    const lines = `gtfs_stop_lines${suffix}`;
    // (stop_id, route_id) distincts desservis (quais).
    await this.query(`
      WITH stop_routes AS (
        SELECT DISTINCT st.stop_id AS stop_id, t.route_id AS route_id
        FROM ${stt} st JOIN ${trips} t ON t.trip_id = st.trip_id
      ),
      stop_modes AS (
        SELECT sr.stop_id AS stop_id, r.route_type AS mode
        FROM stop_routes sr JOIN ${routes} r ON r.route_id = sr.route_id
      )
      INSERT INTO ${modes}(stop_id, mode)
      SELECT stop_id, mode FROM stop_modes
      UNION
      SELECT s.parent_station, sm.mode
      FROM stop_modes sm JOIN ${stops} s ON s.stop_id = sm.stop_id
      WHERE s.parent_station IS NOT NULL
      ON CONFLICT (stop_id, mode) DO NOTHING;
    `);
    await this.query(`
      WITH stop_routes AS (
        SELECT DISTINCT st.stop_id AS stop_id, t.route_id AS route_id
        FROM ${stt} st JOIN ${trips} t ON t.trip_id = st.trip_id
      ),
      stop_lines AS (
        SELECT sr.stop_id AS stop_id, r.route_type AS mode,
               COALESCE(NULLIF(r.route_short_name, ''), r.route_long_name) AS name
        FROM stop_routes sr JOIN ${routes} r ON r.route_id = sr.route_id
      )
      INSERT INTO ${lines}(stop_id, mode, name)
      SELECT stop_id, mode, name FROM stop_lines
      UNION
      SELECT s.parent_station, sl.mode, sl.name
      FROM stop_lines sl JOIN ${stops} s ON s.stop_id = sl.stop_id
      WHERE s.parent_station IS NOT NULL
      ON CONFLICT (stop_id, mode, name) DO NOTHING;
    `);
  }

  /**
   * Comptes filtrés (parité avec l'ancien index en mémoire). `suffix='_next'`
   * pour calculer depuis le staging avant la bascule atomique.
   */
  async computeCounts(suffix = ''): Promise<{
    stops: number;
    routes: number;
    trips: number;
    agencies: number;
    stop_times: number;
  }> {
    const stt = `gtfs_stop_times${suffix}`;
    const trips = `gtfs_trips${suffix}`;
    const routes = `gtfs_routes${suffix}`;
    const stops = `gtfs_stops${suffix}`;
    const stopsQ = await this.query(`SELECT count(*)::int AS n FROM ${stops}`);
    const stQ = await this.query(`SELECT count(*)::int AS n FROM ${stt}`);
    const tripsQ = await this.query(
      `SELECT count(DISTINCT t.trip_id)::int AS n
       FROM ${stt} st JOIN ${trips} t ON t.trip_id = st.trip_id`,
    );
    const routesQ = await this.query(
      `SELECT count(DISTINCT r.route_id)::int AS n
       FROM ${stt} st JOIN ${trips} t ON t.trip_id = st.trip_id
       JOIN ${routes} r ON r.route_id = t.route_id`,
    );
    const agenciesQ = await this.query(
      `SELECT count(DISTINCT r.agency_id)::int AS n
       FROM ${stt} st JOIN ${trips} t ON t.trip_id = st.trip_id
       JOIN ${routes} r ON r.route_id = t.route_id`,
    );
    return {
      stops: Number(stopsQ.rows[0]?.n ?? 0),
      stop_times: Number(stQ.rows[0]?.n ?? 0),
      trips: Number(tripsQ.rows[0]?.n ?? 0),
      routes: Number(routesQ.rows[0]?.n ?? 0),
      agencies: Number(agenciesQ.rows[0]?.n ?? 0),
    };
  }

  /** @deprecated Conservé pour compat ; le chemin atomique utilise swapAndFinalize. */
  async markLoaded(): Promise<void> {
    const counts = await this.computeCounts();
    await this.query(
      `UPDATE gtfs_load_meta
       SET loaded = TRUE, last_load_time = NOW(),
           stops = $1, routes = $2, trips = $3, agencies = $4, stop_times = $5
       WHERE id = TRUE;`,
      [
        counts.stops,
        counts.routes,
        counts.trips,
        counts.agencies,
        counts.stop_times,
      ],
    );
    this.invalidateLoadedCache();
  }

  // ─── Méta de chargement (isLoaded / getStats / getLastLoadTime) ───

  private loadedCache: { value: boolean; ts: number } | null = null;
  private readonly LOADED_CACHE_MS = 5000;

  // ─── Cache long-vie des stop_times par trip (marche RAPTOR) ───
  // La séquence d'arrêts d'une course est immuable entre deux rechargements
  // GTFS. La cacher en process évite de re-lire les mêmes trips à chaque
  // recherche d'itinéraire (le RAPTOR_considère des centaines de trips).
  // Invalidé par invalidateLoadedCache(), lui-même appelé à chaque swap
  // atomique (swapAndFinalize) et au load initial → zéro staleness.
  private tripStopTimesCache = new Map<string, GtfsStopTime[]>();
  private readonly TRIP_CACHE_MAX = 20000;

  async isLoaded(): Promise<boolean> {
    const now = Date.now();
    if (this.loadedCache && now - this.loadedCache.ts < this.LOADED_CACHE_MS) {
      return this.loadedCache.value;
    }
    try {
      const res = await this.query<{ loaded: boolean }>(
        'SELECT loaded FROM gtfs_load_meta WHERE id = TRUE',
      );
      const value = res.rows[0]?.loaded === true;
      this.loadedCache = { value, ts: now };
      return value;
    } catch (err) {
      // Log au lieu d'avaler silencieusement : sinon le garde-boucle de onModuleInit
      // (skip si déjà chargé) échoue sans trace et déclenche un rechargement à
      // chaque boot.
      this.logger.warn(
        `isLoaded() query failed: ${err instanceof Error ? err.message : err} — assuming not loaded.`,
      );
      return false;
    }
  }

  invalidateLoadedCache(): void {
    this.loadedCache = null;
    // Le swap atomique a remplacé les tables live : les séquences de trips
    // qu'on avait cachées ne sont plus garanties cohérentes → on vide.
    this.tripStopTimesCache.clear();
  }

  async getMeta(): Promise<{
    loaded: boolean;
    last_load_time: Date | null;
    stops: number;
    routes: number;
    trips: number;
    agencies: number;
    stop_times: number;
  } | null> {
    const res = await this.query<{
      loaded: boolean;
      last_load_time: Date | null;
      stops: number;
      routes: number;
      trips: number;
      agencies: number;
      stop_times: number;
    }>(
      'SELECT loaded, last_load_time, stops, routes, trips, agencies, stop_times FROM gtfs_load_meta WHERE id = TRUE',
    );
    return res.rows[0] ?? null;
  }

  // ─── Lectures paramétrées (consommées par GtfsParserService) ───

  private static asString(value: unknown): string {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value ?? '');
  }

  private static optString(value: unknown): string | undefined {
    if (value == null) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value);
  }

  private static asNumber(value: unknown): number {
    return Number(value);
  }

  private static optNumber(value: unknown): number | undefined {
    return value == null ? undefined : Number(value);
  }

  private rowToStop(r: QueryResultRow): GtfsStop {
    return {
      stop_id: GtfsDbService.asString(r.stop_id),
      stop_code: GtfsDbService.optString(r.stop_code),
      stop_name: GtfsDbService.asString(r.stop_name),
      stop_desc: GtfsDbService.optString(r.stop_desc),
      stop_lat: GtfsDbService.asNumber(r.stop_lat),
      stop_lon: GtfsDbService.asNumber(r.stop_lon),
      location_type: GtfsDbService.optNumber(r.location_type),
      parent_station: GtfsDbService.optString(r.parent_station),
      stop_timezone: GtfsDbService.optString(r.stop_timezone),
      wheelchair_boarding: GtfsDbService.optNumber(r.wheelchair_boarding),
      platform_code: GtfsDbService.optString(r.platform_code),
    };
  }

  private rowToRoute(r: QueryResultRow): GtfsRoute {
    return {
      route_id: GtfsDbService.asString(r.route_id),
      agency_id: GtfsDbService.optString(r.agency_id),
      route_short_name: GtfsDbService.asString(r.route_short_name),
      route_long_name: GtfsDbService.asString(r.route_long_name),
      route_desc: GtfsDbService.optString(r.route_desc),
      route_type: GtfsDbService.asNumber(r.route_type),
      route_url: GtfsDbService.optString(r.route_url),
      route_color: GtfsDbService.optString(r.route_color),
      route_text_color: GtfsDbService.optString(r.route_text_color),
      route_sort_order: GtfsDbService.optNumber(r.route_sort_order),
    };
  }

  private rowToTrip(r: QueryResultRow): GtfsTrip {
    return {
      route_id: GtfsDbService.asString(r.route_id),
      service_id: GtfsDbService.asString(r.service_id),
      trip_id: GtfsDbService.asString(r.trip_id),
      trip_headsign: GtfsDbService.optString(r.trip_headsign),
      trip_short_name: GtfsDbService.optString(r.trip_short_name),
      direction_id: GtfsDbService.optNumber(r.direction_id),
      shape_id: GtfsDbService.optString(r.shape_id),
      wheelchair_accessible: GtfsDbService.optNumber(r.wheelchair_accessible),
      bikes_allowed: GtfsDbService.optNumber(r.bikes_allowed),
    };
  }

  private rowToStopTime(r: QueryResultRow): GtfsStopTime {
    return {
      trip_id: GtfsDbService.asString(r.trip_id),
      arrival_time: GtfsDbService.asString(r.arrival_time),
      departure_time: GtfsDbService.asString(r.departure_time),
      stop_id: GtfsDbService.asString(r.stop_id),
      stop_sequence: GtfsDbService.asNumber(r.stop_sequence),
      stop_headsign: GtfsDbService.optString(r.stop_headsign),
      pickup_type: GtfsDbService.optNumber(r.pickup_type),
      drop_off_type: GtfsDbService.optNumber(r.drop_off_type),
      shape_dist_traveled: GtfsDbService.optNumber(r.shape_dist_traveled),
      timepoint: GtfsDbService.optNumber(r.timepoint),
    };
  }

  /**
   * Recherche d'arrêts par nom (insensible casse/accents via stop_name_norm).
   * Regroupe les quais sous leur gare parente (parité avec l'ancien
   * searchStopsByName : représentant = StopPlace si indexé, sinon le quai).
   */
  async searchStopsByName(
    normQuery: string,
    limit: number,
  ): Promise<GtfsStop[]> {
    const res = await this.query<QueryResultRow>(
      `WITH matching AS (
         SELECT s.*, COALESCE(s.parent_station, s.stop_id) AS station_id
         FROM gtfs_stops s
         WHERE s.stop_name_norm LIKE '%' || $1 || '%'
       )
       SELECT DISTINCT ON (m.station_id)
         COALESCE(p.stop_id, m.stop_id) AS stop_id,
         COALESCE(p.stop_code, m.stop_code) AS stop_code,
         COALESCE(p.stop_name, m.stop_name) AS stop_name,
         COALESCE(p.stop_desc, m.stop_desc) AS stop_desc,
         COALESCE(p.stop_lat, m.stop_lat) AS stop_lat,
         COALESCE(p.stop_lon, m.stop_lon) AS stop_lon,
         COALESCE(p.location_type, m.location_type) AS location_type,
         COALESCE(p.parent_station, m.parent_station) AS parent_station,
         COALESCE(p.stop_timezone, m.stop_timezone) AS stop_timezone,
         COALESCE(p.wheelchair_boarding, m.wheelchair_boarding) AS wheelchair_boarding,
         COALESCE(p.platform_code, m.platform_code) AS platform_code
       FROM matching m
       LEFT JOIN gtfs_stops p ON p.stop_id = m.station_id AND p.location_type = 1
       ORDER BY m.station_id, m.stop_id
       LIMIT $2;`,
      [normQuery, limit],
    );
    return res.rows.map((r) => this.rowToStop(r));
  }

  /** Modes (route_type) desservant un arrêt, avec fallback gare parente. */
  async getStopModes(stopId: string): Promise<number[]> {
    const res = await this.query<{ mode: number }>(
      `WITH parent AS (SELECT parent_station FROM gtfs_stops WHERE stop_id = $1)
       SELECT mode FROM gtfs_stop_modes WHERE stop_id = $1
       UNION
       SELECT g.mode FROM gtfs_stop_modes g CROSS JOIN parent p
       WHERE p.parent_station IS NOT NULL AND g.stop_id = p.parent_station;`,
      [stopId],
    );
    return res.rows.map((r) => Number(r.mode));
  }

  /** Lignes desservant un arrêt, avec fallback gare parente. */
  async getStopLines(
    stopId: string,
  ): Promise<{ mode: number; name: string }[]> {
    const res = await this.query<{ mode: number; name: string }>(
      `WITH parent AS (SELECT parent_station FROM gtfs_stops WHERE stop_id = $1)
       SELECT mode, name FROM gtfs_stop_lines WHERE stop_id = $1
       UNION
       SELECT g.mode, g.name FROM gtfs_stop_lines g CROSS JOIN parent p
       WHERE p.parent_station IS NOT NULL AND g.stop_id = p.parent_station;`,
      [stopId],
    );
    return res.rows.map((r) => ({ mode: Number(r.mode), name: r.name }));
  }

  /** Arrêts dans une bbox (filtre haversine final en Node). */
  async findStopsNearbyBbox(
    latMin: number,
    latMax: number,
    lonMin: number,
    lonMax: number,
  ): Promise<GtfsStop[]> {
    const res = await this.query<QueryResultRow>(
      `SELECT stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon,
              location_type, parent_station, stop_timezone, wheelchair_boarding, platform_code
       FROM gtfs_stops
       WHERE stop_lat BETWEEN $1 AND $2 AND stop_lon BETWEEN $3 AND $4;`,
      [latMin, latMax, lonMin, lonMax],
    );
    return res.rows.map((r) => this.rowToStop(r));
  }

  /**
   * Renvoie tous les quais embarquables (location_type=0 avec stop_times)
   * des stations parentes données. Sert à l'expansion par gare dans
   * findStopsNearby : une fois la gare la plus proche identifiée, on expose
   * au RAPTOR tous ses quais (métro, RER, bus…), pas seulement les N plus
   * proches par coordonnées — sinon une ligne dont le quai est noyé sous
   * les entrées/alias sans stop_times (ex. métro 4 à Gare du Nord) n'est
   * jamais interrogée. Utilise idx_gtfs_stops_parent.
   */
  async findPlatformsByParentStations(
    parentStationIds: string[],
  ): Promise<GtfsStop[]> {
    if (parentStationIds.length === 0) return [];
    const res = await this.query<QueryResultRow>(
      `SELECT stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon,
              location_type, parent_station, stop_timezone, wheelchair_boarding, platform_code
       FROM gtfs_stops
       WHERE location_type = 0
         AND parent_station = ANY($1::text[])
         AND EXISTS (SELECT 1 FROM gtfs_stop_times WHERE stop_id = gtfs_stops.stop_id);`,
      [parentStationIds],
    );
    return res.rows.map((r) => this.rowToStop(r));
  }

  /** Lignes desservant un arrêt (distinct sur route). */
  async getRoutesForStop(stopId: string): Promise<GtfsRoute[]> {
    const res = await this.query<QueryResultRow>(
      `SELECT DISTINCT r.route_id, r.agency_id, r.route_short_name, r.route_long_name,
              r.route_desc, r.route_type, r.route_url, r.route_color, r.route_text_color, r.route_sort_order
       FROM gtfs_stop_times st
       JOIN gtfs_trips t ON t.trip_id = st.trip_id
       JOIN gtfs_routes r ON r.route_id = t.route_id
       WHERE st.stop_id = $1;`,
      [stopId],
    );
    return res.rows.map((r) => this.rowToRoute(r));
  }

  /**
   * Prochains départs d'un arrêt >= timeAfterSeconds. Joint trip+route.
   * Sur-fetch configurable (GTFS_DEPARTURE_OVERFETCH, default 10) pour laisser
   * au RAPTOR assez de candidats après filtrage service + dédup par route.
   */
  async getNextDepartures(
    stopId: string,
    timeAfterSeconds: number,
    limit: number,
    overfetch: number,
  ): Promise<{ trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[]> {
    const fetchN = Math.max(limit * overfetch, 50);
    const res = await this.query<QueryResultRow>(
      `SELECT st.trip_id, st.arrival_time, st.departure_time, st.stop_id,
              st.stop_sequence, st.stop_headsign, st.pickup_type, st.drop_off_type,
              st.shape_dist_traveled, st.timepoint,
              t.route_id, t.service_id, t.trip_headsign, t.trip_short_name,
              t.direction_id, t.shape_id, t.wheelchair_accessible, t.bikes_allowed,
              r.agency_id, r.route_short_name, r.route_long_name, r.route_desc,
              r.route_type, r.route_url, r.route_color, r.route_text_color, r.route_sort_order
       FROM gtfs_stop_times st
       JOIN gtfs_trips t ON t.trip_id = st.trip_id
       JOIN gtfs_routes r ON r.route_id = t.route_id
       WHERE st.stop_id = $1 AND st.departure_seconds >= $2
       ORDER BY st.departure_seconds
       LIMIT $3;`,
      [stopId, timeAfterSeconds, fetchN],
    );
    return res.rows.map((r) => ({
      trip: this.rowToTrip(r),
      route: this.rowToRoute(r),
      stopTime: this.rowToStopTime(r),
    }));
  }

  /**
   * Prochains départs pour un ensemble d'arrêts en UNE requête (batch RAPTOR),
   * avec un seuil horaire **per-stop** : `minDepSecondsArr[i]` = bestArrival du
   * stop `stopIds[i]`. On utilise `unnest(...) JOIN LATERAL (… ORDER BY
   * departure_seconds LIMIT $4)` pour récupérer les `limit` prochains départs de
   * chaque arrêt après son propre seuil — équivalent exact de l'ancienne boucle
   * par-stop (`getNextDepartures(stopId, currentArrival, 5)` + overfetch), mais
   * en UNE seule requête. Le dédup "1er départ par route" reste côté Node.
   *
   * Le `LIMIT $4` par stop (index `idx_gtfs_st_stop_departure` sur
   * (stop_id, departure_seconds)) borne le scan : ~50 départs/stop contre tous
   * les départs de la journée qu'imposerait une window function sur 6,8 M de
   * lignes. Filtre service appliqué avant le LIMIT (sinon un trip inactif occupe
   * un slot). Retourne Map<stopId, {trip, route, stopTime}[]>.
   */
  async getNextDeparturesBatch(
    stopIds: string[],
    minDepSecondsArr: number[],
    activeServiceIds: string[],
    limit: number,
  ): Promise<
    Map<string, { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[]>
  > {
    const result = new Map<
      string,
      { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[]
    >();
    if (stopIds.length === 0) return result;
    for (const id of stopIds) result.set(id, []);
    const res = await this.query<QueryResultRow & { stop_id: string }>(
      `SELECT d.trip_id, d.arrival_time, d.departure_time, d.stop_id,
              d.stop_sequence, d.stop_headsign, d.pickup_type, d.drop_off_type,
              d.shape_dist_traveled, d.timepoint,
              d.route_id, d.service_id, d.trip_headsign, d.trip_short_name,
              d.direction_id, d.shape_id, d.wheelchair_accessible, d.bikes_allowed,
              d.agency_id, d.route_short_name, d.route_long_name, d.route_desc,
              d.route_type, d.route_url, d.route_color, d.route_text_color, d.route_sort_order
       FROM unnest($1::text[], $2::int[]) AS s(stop_id, min_dep)
       JOIN LATERAL (
         SELECT st.trip_id, st.arrival_time, st.departure_time, st.stop_id,
                st.stop_sequence, st.stop_headsign, st.pickup_type, st.drop_off_type,
                st.shape_dist_traveled, st.timepoint,
                t.route_id, t.service_id, t.trip_headsign, t.trip_short_name,
                t.direction_id, t.shape_id, t.wheelchair_accessible, t.bikes_allowed,
                r.agency_id, r.route_short_name, r.route_long_name, r.route_desc,
                r.route_type, r.route_url, r.route_color, r.route_text_color, r.route_sort_order
         FROM gtfs_stop_times st
         JOIN gtfs_trips t ON t.trip_id = st.trip_id
         JOIN gtfs_routes r ON r.route_id = t.route_id
         WHERE st.stop_id = s.stop_id
           AND st.departure_seconds >= s.min_dep
           AND (cardinality($3::text[]) = 0 OR t.service_id = ANY($3::text[]))
         ORDER BY st.departure_seconds
         LIMIT $4
       ) d ON true;`,
      [stopIds, minDepSecondsArr, activeServiceIds, limit],
    );
    for (const r of res.rows) {
      const arr = result.get(r.stop_id);
      if (arr) {
        arr.push({
          trip: this.rowToTrip(r),
          route: this.rowToRoute(r),
          stopTime: this.rowToStopTime(r),
        });
      }
    }
    return result;
  }

  /** Prochains départs pour aujourd'hui, filtrés par services actifs. */
  async getStopDepartures(
    stopId: string,
    nowSeconds: number,
    activeServiceIds: string[],
    limit: number,
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
    const res = await this.query<QueryResultRow>(
      `SELECT st.departure_time, st.arrival_time, st.stop_sequence, st.stop_headsign,
              t.trip_id, t.route_id, t.service_id, t.trip_headsign,
              r.route_short_name, r.route_long_name, r.route_color, r.route_type
       FROM gtfs_stop_times st
       JOIN gtfs_trips t ON t.trip_id = st.trip_id
       JOIN gtfs_routes r ON r.route_id = t.route_id
       WHERE st.stop_id = $1 AND st.departure_seconds >= $2
         AND (cardinality($3::text[]) = 0 OR t.service_id = ANY($3::text[]))
       ORDER BY st.departure_seconds
       LIMIT $4;`,
      [stopId, nowSeconds, activeServiceIds, limit * 3],
    );
    return res.rows.map((r) => {
      const departureSeconds = this.timeToSeconds(String(r.departure_time));
      return {
        tripId: String(r.trip_id),
        routeId: String(r.route_id),
        lineName: String(r.route_short_name || r.route_long_name),
        lineColor: r.route_color ? `#${String(r.route_color)}` : '#999',
        routeType: Number(r.route_type),
        headsign: String(r.trip_headsign || r.route_long_name || ''),
        departureTime: String(r.departure_time),
        arrivalTime: String(r.arrival_time),
        waitMinutes: Math.round((departureSeconds - nowSeconds) / 60),
        platform: r.stop_headsign ? String(r.stop_headsign) : undefined,
      };
    });
  }

  /** Services actifs pour une date (calendrier + exceptions). */
  async getActiveServiceIds(
    dateNum: number,
    dayOfWeek: number,
    dateStr: string,
  ): Promise<Set<string>> {
    const dayField = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][dayOfWeek];
    // $2 (dayOfWeek) n'est PAS un paramètre SQL : dayField est interpolé comme
    // nom de colonne. Ne pas le passer au pool sinon pg lève
    // « could not determine data type of parameter $2 » (param inutilisé).
    const res = await this.query<{ service_id: string }>(
      `WITH cal AS (
         SELECT service_id FROM gtfs_calendar
         WHERE $1::int BETWEEN start_date::int AND end_date::int
           AND ${dayField} = 1
       ),
       added AS (
         SELECT service_id FROM gtfs_calendar_dates WHERE date = $2 AND exception_type = 1
       ),
       removed AS (
         SELECT service_id FROM gtfs_calendar_dates WHERE date = $2 AND exception_type = 2
       )
       SELECT service_id FROM (
         SELECT service_id FROM cal UNION SELECT service_id FROM added
       ) u
       WHERE service_id NOT IN (SELECT service_id FROM removed);`,
      [dateNum, dateStr],
    );
    return new Set(res.rows.map((r) => r.service_id));
  }

  /** Horaires d'une course, triés par séquence (marche de trip RAPTOR). */
  async getTripStopTimes(tripId: string): Promise<GtfsStopTime[]> {
    const cached = this.tripStopTimesCache.get(tripId);
    if (cached) return cached;
    const res = await this.query<QueryResultRow>(
      `SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence,
              stop_headsign, pickup_type, drop_off_type, shape_dist_traveled, timepoint
       FROM gtfs_stop_times WHERE trip_id = $1 ORDER BY stop_sequence;`,
      [tripId],
    );
    const rows = res.rows.map((r) => this.rowToStopTime(r));
    this.cacheTripStopTimes(tripId, rows);
    return rows;
  }

  /** Éviction LRU du cache trip long-vie. */
  private cacheTripStopTimes(tripId: string, rows: GtfsStopTime[]): void {
    if (this.tripStopTimesCache.size >= this.TRIP_CACHE_MAX) {
      const oldest = this.tripStopTimesCache.keys().next().value as
        | string
        | undefined;
      if (oldest !== undefined) this.tripStopTimesCache.delete(oldest);
    }
    this.tripStopTimesCache.set(tripId, rows);
  }

  /**
   * Stop_times d'un ensemble de courses en UNE requête (batch RAPTOR).
   * Retourne un Map<tripId, GtfsStopTime[]> trié par stop_sequence. Les trips
   * déjà en cache long-vie ne sont pas re-demandés ; les trips demandés mais
   * absents de la base sont cachés comme [] pour éviter de re-requêter.
   */
  async getTripStopTimesBatch(
    tripIds: string[],
  ): Promise<Map<string, GtfsStopTime[]>> {
    const result = new Map<string, GtfsStopTime[]>();
    if (tripIds.length === 0) return result;
    const missing = new Set<string>();
    for (const id of tripIds) {
      const cached = this.tripStopTimesCache.get(id);
      if (cached) result.set(id, cached);
      else missing.add(id);
    }
    if (missing.size === 0) return result;
    const ids = [...missing];
    const res = await this.query<QueryResultRow>(
      `SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence,
              stop_headsign, pickup_type, drop_off_type, shape_dist_traveled, timepoint
       FROM gtfs_stop_times WHERE trip_id = ANY($1::text[])
       ORDER BY trip_id, stop_sequence;`,
      [ids],
    );
    const found = new Set<string>();
    for (const r of res.rows) {
      const t = r.trip_id as string;
      const arr = result.get(t) ?? [];
      if (!result.has(t)) result.set(t, arr);
      arr.push(this.rowToStopTime(r));
      found.add(t);
    }
    // Cache les trips trouvés (complets) et les trips absents ([]) .
    for (const id of ids) {
      const rows = result.get(id) ?? [];
      if (!found.has(id)) result.set(id, rows); // []
      this.cacheTripStopTimes(id, rows);
    }
    return result;
  }

  /**
   * Correspondances à pied depuis un ensemble d'arrêts en UNE requête
   * (batch RAPTOR). Retourne Map<stopId, {to_stop_id, min_transfer_time}[]>.
   */
  async getTransfersFromBatch(
    stopIds: string[],
  ): Promise<
    Map<string, { to_stop_id: string; min_transfer_time: number | null }[]>
  > {
    const result = new Map<
      string,
      { to_stop_id: string; min_transfer_time: number | null }[]
    >();
    if (stopIds.length === 0) return result;
    for (const id of stopIds) result.set(id, []);
    const res = await this.query<{
      from_stop_id: string;
      to_stop_id: string;
      min_transfer_time: number | null;
    }>(
      `SELECT from_stop_id, to_stop_id, min_transfer_time
       FROM gtfs_transfers WHERE from_stop_id = ANY($1::text[]);`,
      [stopIds],
    );
    for (const r of res.rows) {
      const arr = result.get(r.from_stop_id);
      if (arr) {
        arr.push({
          to_stop_id: r.to_stop_id,
          min_transfer_time:
            r.min_transfer_time == null ? null : Number(r.min_transfer_time),
        });
      }
    }
    return result;
  }

  /** Correspondances à pied depuis un arrêt. */
  async getTransfersFrom(
    stopId: string,
  ): Promise<{ to_stop_id: string; min_transfer_time: number | null }[]> {
    const res = await this.query<{
      to_stop_id: string;
      min_transfer_time: number | null;
    }>(
      `SELECT to_stop_id, min_transfer_time FROM gtfs_transfers WHERE from_stop_id = $1;`,
      [stopId],
    );
    return res.rows.map((r) => ({
      to_stop_id: r.to_stop_id,
      min_transfer_time:
        r.min_transfer_time == null ? null : Number(r.min_transfer_time),
    }));
  }

  /** Coordonnées d'un ensemble d'arrêts (pour estimateTransitDistance). */
  async getStopCoordsByIds(
    stopIds: string[],
  ): Promise<Map<string, { lat: number; lon: number }>> {
    if (stopIds.length === 0) return new Map();
    const res = await this.query<{
      stop_id: string;
      stop_lat: number;
      stop_lon: number;
    }>(
      `SELECT stop_id, stop_lat, stop_lon FROM gtfs_stops WHERE stop_id = ANY($1::text[]);`,
      [stopIds],
    );
    const m = new Map<string, { lat: number; lon: number }>();
    for (const r of res.rows) {
      m.set(r.stop_id, { lat: Number(r.stop_lat), lon: Number(r.stop_lon) });
    }
    return m;
  }

  private timeToSeconds(time: string): number {
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
}
