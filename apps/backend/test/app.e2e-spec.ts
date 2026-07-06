import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, CanActivate } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { applyAppConfig } from './../src/app.config';
import { GtfsParserService } from './../src/transport/gtfs-parser.service';
import { PrimService } from './../src/transport/prim.service';
import { GtfsRtService } from './../src/transport/gtfs-rt.service';
import { OsrmService } from './../src/transport/osrm.service';
import { GtfsDbService } from './../src/transport/gtfs-db.service';
import { NavitiaService } from './../src/transport/navitia.service';

/**
 * Tests e2e — UrbanFlow API.
 *
 * Stratégie :
 *  - On monte le VRAI AppModule (DB PostgreSQL réelle, auth JWT, validation,
 *    filtre d'exceptions) via `applyAppConfig` partagé avec `main.ts`, afin
 *    d'exercer les routes réellement préfixées `/api`.
 *  - Les services réseau (GTFS/PRIM/OSRM/GTFS-RT/Navitia) sont remplacés par
 *    des mocks `useValue` qui n'implémentent PAS `OnModuleInit` : aucun
 *    téléchargement GTFS asynchrone n'est déclenché, et Jest peut quitter
 *    proprement (plus de handle qui fuit après le teardown).
 *  - Le `ThrottlerGuard` global est neutralisé (le rate-limiting est testé
 *    séparément) pour éviter la flakiness « 5 req/min » sur les exécutions
 *    répétées.
 *  - Chaque run utilise un email unique ; le compte est supprimé en fin de test
 *    (valide au passage le droit à l'effacement RGPD).
 */

// ─── Mocks des services réseau (aucun OnModuleInit → aucun IO asynchrone) ───
// Méthodes synchrones retournant des valeurs : le contrôleur les `await`
// (await sur une valeur non-Promise résout à la valeur elle-même).
const gtfsParserMock = {
  isLoaded: () => true,
  getLastLoadTime: () => '2026-06-29T09:35:43.309Z',
  getStats: () => ({ stops: 11660, routes: 416, trips: 383549, agencies: 64 }),
  searchStopsByName: () => [],
  getStopModes: () => [],
  getStopLines: () => [],
  getShapeById: () => [],
  getStopTimesForStop: () => [],
  getNearbyStops: () => [],
  getLinesByMode: () => [],
  findStopsNearby: () => [],
  getRoutesForStop: () => [],
  getStopDepartures: () => [],
  getActiveServiceIds: () => new Set<string>(),
  getTripStopTimes: () => [],
  getTransfersFrom: () => [],
  getStopCoordsByIds: () => new Map(),
  getNextDepartures: () => [],
};

// GtfsDbService : no-op (pas de connexion PG pendant les tests e2e sur mocks).
const gtfsDbMock = {
  onModuleInit: () => undefined,
  onModuleDestroy: () => undefined,
};

const primServiceMock = {
  geocode: () => ({ results: [] }),
  reverseGeocode: () => ({ label: 'Adresse mockée' }),
  getVelibStations: () => ({ total_count: 0, results: [] }),
  getNearbyVelibStations: () => [],
  getLinesByMode: () => ({
    metro: [],
    rer: [],
    tram: [],
    transilien: [],
  }),
};

const gtfsRtMock = { getAlerts: () => [] };

const osrmMock = {
  getRoute: () => ({
    geometry: {
      type: 'LineString',
      coordinates: [
        [2.347, 48.859],
        [2.35, 48.86],
      ],
    },
    distance: 350,
    duration: 180,
  }),
};

const navitiaMock = {
  isAvailable: () => false,
  getAlerts: () => [],
  findJourneys: () => [],
};

// Throttling désactivé en e2e (testé ailleurs) — évite la flakiness 5/min.
const NoopGuard: CanActivate = {
  canActivate: () => true,
};

function extractTokenCookie(setCookieHeader: string | string[]): string {
  const header = Array.isArray(setCookieHeader)
    ? setCookieHeader.join(';')
    : setCookieHeader;
  const match = header.match(/urbanflow_token=[^;]+/);
  if (!match) {
    throw new Error('JWT cookie not found in response');
  }
  return match[0];
}

describe('UrbanFlow API (e2e)', () => {
  let app: INestApplication<App>;
  let uniqueEmail: string;
  let authCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GtfsParserService)
      .useValue(gtfsParserMock)
      .overrideProvider(PrimService)
      .useValue(primServiceMock)
      .overrideProvider(GtfsRtService)
      .useValue(gtfsRtMock)
      .overrideProvider(OsrmService)
      .useValue(osrmMock)
      .overrideProvider(GtfsDbService)
      .useValue(gtfsDbMock)
      .overrideProvider(NavitiaService)
      .useValue(navitiaMock)
      .overrideProvider(APP_GUARD)
      .useValue(NoopGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    applyAppConfig(app); // routing / validation / filtre / préfixe /api réels
    await app.init();

    // Email unique par run (Date.now + suffixe) pour éviter les collisions
    // avec des comptes existants dans la base de dev.
    uniqueEmail = `e2e+${Date.now()}@urbanflow.test`;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api → "Hello World!" (préfixe global respecté)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /api/health → healthcheck opérationnel', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({ status: 'ok' });
        expect(typeof res.body.timestamp).toBe('string');
      });
  });

  it('GET /api/transport/gtfs-status → état du GTFS (mocké)', () => {
    return request(app.getHttpServer())
      .get('/api/transport/gtfs-status')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          loaded: true,
          stats: { stops: 11660, routes: 416 },
        });
        expect(res.body.lastLoadTime).toBe('2026-06-29T09:35:43.309Z');
      });
  });

  it('POST /api/auth/register → crée un compte + cookie JWT httpOnly', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail, password: 'test1234', displayName: 'E2E' })
      .expect(201);

    expect(res.body.user).toMatchObject({
      email: uniqueEmail,
      displayName: 'E2E',
      role: 'user',
    });
    expect(res.body.user.id).toBeTruthy();

    // Cookie JWT httpOnly posé
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookie = Array.isArray(cookies) ? cookies.join(';') : cookies;
    expect(cookie).toContain('urbanflow_token=');
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('POST /api/auth/register → 400 si payload invalide (validation pipe)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' }) // email invalide + mdp < 8
      .expect(400);
  });

  it('POST /api/auth/login + GET /api/auth/me → round-trip auth JWT', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: uniqueEmail, password: 'test1234' })
      .expect(201);

    authCookie = extractTokenCookie(loginRes.headers['set-cookie']);
    expect(authCookie).toBeDefined();

    // /me requiert le JWT (AuthGuard('jwt') au niveau du contrôleur, non neutralisé)
    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', authCookie)
      .expect(200);

    expect(meRes.body.email).toBe(uniqueEmail);
  });

  it('GET /api/auth/me sans token → 401 (authentification requise)', () => {
    return request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  // ─── Transport (lecture, pas d'auth) ───────────────────────────────────────

  it('GET /api/transport/lines-by-mode → référentiel des lignes PRIM', () => {
    return request(app.getHttpServer())
      .get('/api/transport/lines-by-mode')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          metro: [],
          rer: [],
          tram: [],
          transilien: [],
        });
      });
  });

  it('GET /api/transport/velib → liste des stations Vélib', () => {
    return request(app.getHttpServer())
      .get('/api/transport/velib')
      .query({ limit: '5' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeDefined();
      });
  });

  it('GET /api/transport/velib-nearby → stations Vélib proches (lat/lon requis)', () => {
    return request(app.getHttpServer())
      .get('/api/transport/velib-nearby')
      .query({ lat: '48.8589', lon: '2.347', radius: '0.5', limit: '5' })
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('GET /api/transport/velib-nearby → 400 si lat/lon manquants', () => {
    return request(app.getHttpServer())
      .get('/api/transport/velib-nearby')
      .expect(400);
  });

  it('GET /api/transport/geocode → recherche adresses + arrêts GTFS', () => {
    return request(app.getHttpServer())
      .get('/api/transport/geocode')
      .query({ q: 'Opéra', limit: '5' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('total_count');
        expect(Array.isArray(res.body.results)).toBe(true);
      });
  });

  it('GET /api/transport/reverse-geocode → coordonnées vers adresse', () => {
    return request(app.getHttpServer())
      .get('/api/transport/reverse-geocode')
      .query({ lat: '48.8589', lon: '2.347' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('label');
      });
  });

  it('GET /api/transport/reverse-geocode → 400 si lat/lon manquants', () => {
    return request(app.getHttpServer())
      .get('/api/transport/reverse-geocode')
      .expect(400);
  });

  it('GET /api/transport/realtime-alerts → alertes temps réel', () => {
    return request(app.getHttpServer())
      .get('/api/transport/realtime-alerts')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('GET /api/transport/journey → calcul itinéraire multimodal (fallback local)', () => {
    return request(app.getHttpServer())
      .get('/api/transport/journey')
      .query({
        originLat: '48.8589',
        originLon: '2.347',
        destLat: '48.86',
        destLon: '2.35',
      })
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0]).toHaveProperty('durationMinutes');
        expect(res.body[0]).toHaveProperty('segments');
      });
  });

  it('GET /api/transport/journey → 400 si coordonnées incomplètes', () => {
    return request(app.getHttpServer())
      .get('/api/transport/journey')
      .query({ originLat: '48.8589' })
      .expect(400);
  });

  it('GET /api/transport/route → routing OSRM (mocké)', () => {
    return request(app.getHttpServer())
      .get('/api/transport/route')
      .query({
        originLat: '48.8589',
        originLon: '2.347',
        destLat: '48.86',
        destLon: '2.35',
        profile: 'foot',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('geometry');
        expect(res.body).toHaveProperty('distance');
        expect(res.body).toHaveProperty('duration');
      });
  });

  it('GET /api/transport/route → 400 si coordonnées incomplètes', () => {
    return request(app.getHttpServer())
      .get('/api/transport/route')
      .query({ originLat: '48.8589' })
      .expect(400);
  });

  // ─── Profil utilisateur ──────────────────────────────────────────────────

  it('PUT /api/auth/me → mise à jour du profil', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/auth/me')
      .set('Cookie', authCookie)
      .send({ displayName: 'Updated E2E' })
      .expect(200);

    expect(res.body.displayName).toBe('Updated E2E');
  });

  it('PUT /api/auth/notifications-preference → active/désactive les notifications', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/auth/notifications-preference')
      .set('Cookie', authCookie)
      .send({ enabled: true })
      .expect(200);

    expect(res.body).toEqual({ enabled: true });
  });

  it('POST + GET /api/auth/consent → gestion du consentement RGPD', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/consent')
      .set('Cookie', authCookie)
      .send({
        consentGeoloc: true,
        consentCookies: true,
        consentHistory: true,
        consentVersion: '1.0',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/auth/consent')
      .set('Cookie', authCookie)
      .expect(200);

    expect(res.body).toMatchObject({
      consentGeoloc: true,
      consentCookies: true,
      consentHistory: true,
    });
  });

  it('GET /api/auth/me/export → export RGPD des données utilisateur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me/export')
      .set('Cookie', authCookie)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.headers['content-disposition']).toMatch(
      /urbanflow-data-export\.json/,
    );
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('favorites');
    expect(res.body).toHaveProperty('history');
    expect(res.body).toHaveProperty('notifications');
  });

  // ─── Favoris & historique ─────────────────────────────────────────────────

  it('POST /api/favorites → ajoute un favori', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/favorites')
      .set('Cookie', authCookie)
      .send({
        from: 'Opéra',
        to: 'Bastille',
        mode: 'metro',
        modeColor: '#1A5A73',
        duration: '12 min',
        co2: 0,
      })
      .expect(201);

    expect(res.body).toMatchObject({
      from: 'Opéra',
      to: 'Bastille',
      mode: 'metro',
    });
    expect(res.body.id).toBeTruthy();
  });

  it('GET /api/favorites → liste les favoris de l’utilisateur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/favorites')
      .set('Cookie', authCookie)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/favorites/stats → statistiques des favoris et historique', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/favorites/stats')
      .set('Cookie', authCookie)
      .expect(200);

    expect(res.body).toMatchObject({
      favoriteCount: expect.any(Number),
      totalTrips: expect.any(Number),
      co2Saved: expect.any(Number),
    });
  });

  it('POST + GET + DELETE /api/favorites/history → cycle de l’historique', async () => {
    await request(app.getHttpServer())
      .post('/api/favorites/history')
      .set('Cookie', authCookie)
      .send({
        from: 'Opéra',
        to: 'Bastille',
        mode: 'metro',
        modeColor: '#1A5A73',
        duration: '12 min',
        co2: 0,
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/favorites/history')
      .set('Cookie', authCookie)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .delete('/api/favorites/history')
      .set('Cookie', authCookie)
      .expect(200)
      .expect({ message: 'Historique effacé' });
  });

  // ─── Notifications push ───────────────────────────────────────────────────

  it('POST /api/notifications/push/subscribe → enregistre un abonnement push', async () => {
    const uniqueEndpoint = `https://fcm.googleapis.com/fake/e2e-endpoint-${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/notifications/push/subscribe')
      .set('Cookie', authCookie)
      .send({
        endpoint: uniqueEndpoint,
        keys: {
          p256dh: 'dGVzdC1wMjU2ZGg=',
          auth: 'dGVzdC1hdXRo',
        },
      })
      .expect(201);

    expect(res.body).toEqual({ success: true, updated: false });
  });

  it('GET /api/notifications → liste les notifications', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', authCookie)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/notifications/unread-count → compte les non-lues', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/notifications/unread-count')
      .set('Cookie', authCookie)
      .expect(200);

    expect(res.body).toEqual({ count: 0 });
  });

  it('POST /api/notifications/mark-all-read → marque tout comme lu', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/notifications/mark-all-read')
      .set('Cookie', authCookie)
      .expect(201);

    expect(res.body).toEqual({
      message: 'All notifications marked as read',
    });
  });

  it('DELETE /api/notifications → efface toutes les notifications (RGPD)', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', authCookie)
      .expect(200);

    expect(res.body).toEqual({ message: 'All notifications deleted' });
  });

  // ─── Droit à l’effacement (dernier test, après les flux authentifiés) ───────

  it("DELETE /api/auth/me → droit à l'effacement RGPD (soft delete) + nettoyage", async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: uniqueEmail, password: 'test1234' })
      .expect(201);

    const tokenCookie = extractTokenCookie(loginRes.headers['set-cookie']);

    await request(app.getHttpServer())
      .delete('/api/auth/me')
      .set('Cookie', tokenCookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toMatch(/supprim/i);
      });
  });
});
