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