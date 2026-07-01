-- Initialisation de la base de données Urban Flow Mobility

-- Extension UUID (nécessaire pour les clés primaires)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users (§4.2 Dossier Technique — RGPD §9.2) ───
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    preferred_mode VARCHAR(50) DEFAULT 'rapide',
    accessibility_needs BOOLEAN DEFAULT FALSE,
    avatar VARCHAR(50) DEFAULT '🚇',
    -- RGPD consent fields (§9.2)
    consent_geoloc BOOLEAN DEFAULT FALSE,
    consent_cookies BOOLEAN DEFAULT FALSE,
    consent_history BOOLEAN DEFAULT FALSE,
    consent_date TIMESTAMP WITH TIME ZONE,
    consent_version VARCHAR(10),
    -- Notification preferences
    notifications_enabled BOOLEAN DEFAULT TRUE,
    -- Soft delete (RGPD Art. 17)
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Favorites (§4.2 — diagramme classes) ───
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "from" VARCHAR(255) NOT NULL,
    "to" VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    mode_color VARCHAR(50),
    duration INTEGER,
    co2 FLOAT,
    origin_lat FLOAT,
    origin_lon FLOAT,
    dest_lat FLOAT,
    dest_lon FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── History (§4.2 — diagramme classes) ───
CREATE TABLE IF NOT EXISTS history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "from" VARCHAR(255) NOT NULL,
    "to" VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL,
    mode_color VARCHAR(50),
    duration INTEGER,
    co2 FLOAT,
    trip_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Notifications (§4.1 cas d'utilisation, §5.2 architecture) ───
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('disruption', 'delay', 'info', 'favorite_alert', 'system')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_line VARCHAR(100),
    related_stop VARCHAR(100),
    action_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Routes (GTFS) ───
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    operator VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Stops (GTFS) ───
CREATE TABLE IF NOT EXISTS stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    type VARCHAR(50) NOT NULL,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE
);

-- ─── Transport Feeds ───
CREATE TABLE IF NOT EXISTS transport_feeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_url VARCHAR(500) NOT NULL,
    format VARCHAR(20) DEFAULT 'GTFS',
    last_update TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Index (performance) ───
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_stops_route ON stops(route_id);
CREATE INDEX IF NOT EXISTS idx_stops_coords ON stops(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ═══════════════════════════════════════════════════════════════════════
-- GTFS statique (IDFM) — stocké en PostgreSQL pour éviter l'OOM Node
-- (l'ancien chargement en Maps en mémoire consommait 2-3 Go sur la VM
--  Docker 3.8 Go → backend OOM-killé). Tables gérées en SQL brut (pool pg),
--  sans entité TypeORM : synchronize:true ne les touche donc pas.
-- ═══════════════════════════════════════════════════════════════════════

-- Recherche de noms insensible aux accents/diacritiques (Châtelet ~ chatelet) :
-- la colonne `stop_name_norm` (plain TEXT) est peuplée au COPY côté Node via
-- normalizeForSearch() — aucune extension `unaccent` nécessaire (et CREATE
-- EXTENSION levait un duplicate_key sur pg_extension/pg_type dans certains
-- états de l'image alpine).

-- Agences (agency.txt)
CREATE TABLE IF NOT EXISTS gtfs_agencies (
    agency_id      TEXT PRIMARY KEY,
    agency_name    TEXT,
    agency_url     TEXT,
    agency_timezone TEXT,
    agency_lang    TEXT,
    agency_phone   TEXT,
    agency_fare_url TEXT,
    agency_email   TEXT
);

-- Lignes (routes.txt)
CREATE TABLE IF NOT EXISTS gtfs_routes (
    route_id        TEXT PRIMARY KEY,
    agency_id       TEXT,
    route_short_name TEXT,
    route_long_name TEXT,
    route_desc      TEXT,
    route_type      SMALLINT,
    route_url       TEXT,
    route_color     TEXT,
    route_text_color TEXT,
    route_sort_order INTEGER
);

-- Arrêts (stops.txt). location_type: 0=Quai, 1=StopPlace(gare), 2=Entrée.
-- stop_name_norm = nom normalisé (lowercase, accents retirés) pour la recherche.
-- Colonne PLAIN TEXT peuplée au COPY (via normalizeForSearch() côté Node) :
-- unaccent() n'est pas IMMUTABLE et ne peut donc pas être utilisé dans une
-- colonne GENERATED (PG rejette "generation expression is not immutable").
CREATE TABLE IF NOT EXISTS gtfs_stops (
    stop_id        TEXT PRIMARY KEY,
    stop_code      TEXT,
    stop_name      TEXT NOT NULL,
    stop_desc      TEXT,
    stop_lat       DOUBLE PRECISION NOT NULL,
    stop_lon       DOUBLE PRECISION NOT NULL,
    location_type  SMALLINT,
    parent_station TEXT,
    stop_timezone  TEXT,
    wheelchair_boarding SMALLINT,
    platform_code  TEXT,
    stop_name_norm TEXT
);

-- Courses (trips.txt)
CREATE TABLE IF NOT EXISTS gtfs_trips (
    trip_id           TEXT PRIMARY KEY,
    route_id          TEXT NOT NULL,
    service_id        TEXT NOT NULL,
    trip_headsign     TEXT,
    trip_short_name   TEXT,
    direction_id      SMALLINT,
    shape_id          TEXT,
    wheelchair_accessible SMALLINT,
    bikes_allowed     SMALLINT
);

-- Horaires (stop_times.txt). arrival/departure_time en TEXT (GTFS autorise
-- 25:30:00 post-minuit qu'une colonne TIME refuserait) + équivalents en
-- secondes (colonnes générées) pour les index/tris numériques.
CREATE TABLE IF NOT EXISTS gtfs_stop_times (
    trip_id           TEXT NOT NULL,
    arrival_time      TEXT NOT NULL,
    departure_time    TEXT NOT NULL,
    stop_id           TEXT NOT NULL,
    stop_sequence     INTEGER NOT NULL,
    stop_headsign     TEXT,
    pickup_type       SMALLINT,
    drop_off_type     SMALLINT,
    shape_dist_traveled DOUBLE PRECISION,
    timepoint         SMALLINT,
    arrival_seconds   INTEGER GENERATED ALWAYS AS (
        (split_part(arrival_time, ':', 1))::int * 3600 +
        (split_part(arrival_time, ':', 2))::int * 60 +
        COALESCE((split_part(arrival_time, ':', 3))::int, 0)
    ) STORED,
    departure_seconds INTEGER GENERATED ALWAYS AS (
        (split_part(departure_time, ':', 1))::int * 3600 +
        (split_part(departure_time, ':', 2))::int * 60 +
        COALESCE((split_part(departure_time, ':', 3))::int, 0)
    ) STORED
);

-- Calendrier hebdomadaire (calendar.txt)
CREATE TABLE IF NOT EXISTS gtfs_calendar (
    service_id  TEXT PRIMARY KEY,
    monday       SMALLINT, tuesday     SMALLINT, wednesday SMALLINT,
    thursday     SMALLINT, friday      SMALLINT, saturday   SMALLINT,
    sunday       SMALLINT,
    start_date   TEXT,    -- YYYYMMDD
    end_date     TEXT     -- YYYYMMDD
);

-- Dates exceptionnelles (calendar_dates.txt). exception_type: 1=ajout, 2=retrait.
CREATE TABLE IF NOT EXISTS gtfs_calendar_dates (
    service_id    TEXT NOT NULL,
    date          TEXT NOT NULL,        -- YYYYMMDD
    exception_type SMALLINT NOT NULL,
    PRIMARY KEY (service_id, date)
);

-- Correspondances à pied (transfers.txt)
CREATE TABLE IF NOT EXISTS gtfs_transfers (
    from_stop_id    TEXT NOT NULL,
    to_stop_id      TEXT NOT NULL,
    transfer_type   SMALLINT,
    min_transfer_time INTEGER
);

-- Agrégats précalculés : modes (route_type) et lignes par arrêt (quai + gare parente).
-- Équivalent SQL de buildStopModes() (gtfs-parser.service.ts).
CREATE TABLE IF NOT EXISTS gtfs_stop_modes (
    stop_id   TEXT NOT NULL,
    mode      SMALLINT NOT NULL,
    PRIMARY KEY (stop_id, mode)
);
CREATE TABLE IF NOT EXISTS gtfs_stop_lines (
    stop_id   TEXT NOT NULL,
    mode      SMALLINT NOT NULL,
    name      TEXT NOT NULL,
    PRIMARY KEY (stop_id, mode, name)
);

-- Méta de chargement : ligne unique (clé booléenne constante) — isLoaded/getStats.
CREATE TABLE IF NOT EXISTS gtfs_load_meta (
    id            BOOLEAN PRIMARY KEY DEFAULT TRUE CONSTRAINT gtfs_load_meta_singleton CHECK (id = TRUE),
    loaded        BOOLEAN NOT NULL DEFAULT FALSE,
    last_load_time TIMESTAMPTZ,
    stops         INTEGER,
    routes        INTEGER,
    trips         INTEGER,
    agencies      INTEGER,
    stop_times    INTEGER
);

-- ─── Index GTFS (hot paths : getNextDepartures, marche de trip RAPTOR,
--     findStopsNearby bbox, recherche par nom, filtre calendrier) ───
CREATE INDEX IF NOT EXISTS idx_gtfs_st_stop_departure ON gtfs_stop_times(stop_id, departure_seconds);
CREATE INDEX IF NOT EXISTS idx_gtfs_st_stop_arrival   ON gtfs_stop_times(stop_id, arrival_seconds);
CREATE INDEX IF NOT EXISTS idx_gtfs_st_trip_sequence  ON gtfs_stop_times(trip_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_gtfs_trips_route       ON gtfs_trips(route_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_trips_service     ON gtfs_trips(service_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_stops_parent      ON gtfs_stops(parent_station);
CREATE INDEX IF NOT EXISTS idx_gtfs_stops_coords      ON gtfs_stops(stop_lat, stop_lon);
CREATE INDEX IF NOT EXISTS idx_gtfs_stops_name_norm   ON gtfs_stops(stop_name_norm);
CREATE INDEX IF NOT EXISTS idx_gtfs_transfers_from     ON gtfs_transfers(from_stop_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_caldates_date      ON gtfs_calendar_dates(date);
CREATE INDEX IF NOT EXISTS idx_gtfs_caldates_service   ON gtfs_calendar_dates(service_id);