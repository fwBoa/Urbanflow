import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
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

/**
 * Tests e2e — UrbanFlow API.
 *
 * Stratégie :
 *  - On monte le VRAI AppModule (DB PostgreSQL réelle, auth JWT, validation,
 *    filtre d'exceptions) via `applyAppConfig` partagé avec `main.ts`, afin
 *    d'exercer les routes réellement préfixées `/api`.
 *  - Les services réseau (GTFS/PRIM/OSRM/GTFS-RT) sont remplacés par des
 *    mocks `useValue` qui n'implémentent PAS `OnModuleInit` : aucun
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
  reverseGeocode: () => ({}),
  getVelibStations: () => [],
};

const gtfsRtMock = { getAlerts: () => [] };
const osrmMock = { getRoute: () => null };

// Throttling désactivé en e2e (testé ailleurs) — évite la flakiness 5/min.
const NoopGuard: CanActivate = {
  canActivate: (_context: ExecutionContext) => true,
};

describe('UrbanFlow API (e2e)', () => {
  let app: INestApplication<App>;
  let uniqueEmail: string;

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

    const cookies = loginRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies.join(';') : cookies;
    const tokenCookie = cookieHeader.match(/urbanflow_token=[^;]+/)?.[0];
    expect(tokenCookie).toBeDefined();

    // /me requiert le JWT (AuthGuard('jwt') au niveau du contrôleur, non neutralisé)
    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', tokenCookie!)
      .expect(200);

    expect(meRes.body.email).toBe(uniqueEmail);
  });

  it('GET /api/auth/me sans token → 401 (authentification requise)', () => {
    return request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it("DELETE /api/auth/me → droit à l'effacement RGPD (soft delete) + nettoyage", async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: uniqueEmail, password: 'test1234' })
      .expect(201);

    const cookies = loginRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies.join(';') : cookies;
    const tokenCookie = cookieHeader.match(/urbanflow_token=[^;]+/)?.[0];

    await request(app.getHttpServer())
      .delete('/api/auth/me')
      .set('Cookie', tokenCookie!)
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toMatch(/supprim/i);
      });
  });
});
