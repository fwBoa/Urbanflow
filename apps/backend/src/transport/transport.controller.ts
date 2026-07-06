import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrimService } from './prim.service';
import {
  GtfsParserService,
  routeTypeLabel,
  modeKey,
} from './gtfs-parser.service';
import { JourneyService, JourneyQuery, JourneyResult } from './journey.service';
import { OsrmRouteResult, OsrmService } from './osrm.service';
import { GtfsRtService, RealtimeAlert } from './gtfs-rt.service';
import { NavitiaService } from './navitia.service';

/**
 * Contrôleur Transport — Expose les données PRIM (Île-de-France Mobilités)
 * au frontend UrbanFlow via des routes REST propres.
 *
 * Routes disponibles :
 * - GET /api/transport/health          → Vérification de la connexion PRIM
 * - GET /api/transport/modes           → Agrégation des lignes par mode de transport
 * - GET /api/transport/lines           → Référentiel des lignes
 * - GET /api/transport/stops            → Référentiel des arrêts
 * - GET /api/transport/stop-lines      → Arrêts et lignes associées
 * - GET /api/transport/traffic         → Messages d'actualité / perturbations
 * - GET /api/transport/velib           → Stations Vélib' temps réel
 * - GET /api/transport/velib-nearby    → Stations Vélib' proches (lat/lon)
 * - GET /api/transport/elevators       → État des ascenseurs
 * - GET /api/transport/gtfs-url        → URL de téléchargement GTFS
 */
@Controller('transport')
export class TransportController {
  private readonly logger = new Logger(TransportController.name);

  constructor(
    private readonly primService: PrimService,
    private readonly gtfsParser: GtfsParserService,
    private readonly journeyService: JourneyService,
    private readonly osrmService: OsrmService,
    private readonly gtfsRtService: GtfsRtService,
    private readonly navitiaService: NavitiaService,
  ) {}

  /**
   * Garde pour les endpoints dépendant des données GTFS : renvoie 503 tant que
   * le chargement en arrière-plan (vers PostgreSQL) n'est pas terminé. Les
   * endpoints PRIM directs (lines-by-mode, velib*, realtime-alerts, geocode…)
   * ne passent PAS par ici.
   */
  private async requireGtfsLoaded(): Promise<void> {
    if (!(await this.gtfsParser.isLoaded())) {
      throw new HttpException(
        { message: 'GTFS en cours de chargement…', loaded: false },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ─── Lignes par mode (F1) ────────────────────────────────────────────

  @Get('lines-by-mode')
  async getLinesByMode() {
    return this.primService.getLinesByMode();
  }

  // ─── Vélib' proches (F4) ──────────────────────────────────────────────

  @Get('velib-nearby')
  async getNearbyVelibStations(
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('radius') radius?: string,
    @Query('limit') limit?: string,
  ) {
    if (!lat || !lon) {
      throw new HttpException(
        'Query parameters "lat" and "lon" are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.primService.getNearbyVelibStations(
      parseFloat(lat),
      parseFloat(lon),
      radius ? parseFloat(radius) : 2,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // ─── Arrêts de transport proches (F4) ────────────────────────────────

  @Get('nearby')
  async getNearbyStops(
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('radius') radius?: string,
    @Query('limit') limit?: string,
  ) {
    await this.requireGtfsLoaded();
    if (!lat || !lon) {
      throw new HttpException(
        'Query parameters "lat" and "lon" are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const radiusKm = radius ? parseFloat(radius) : 0.5;
    const maxResults = limit ? parseInt(limit, 10) : 10;

    const nearby = (
      await this.gtfsParser.findStopsNearby(
        parseFloat(lat),
        parseFloat(lon),
        radiusKm,
      )
    ).slice(0, maxResults);

    const enriched = await Promise.all(
      nearby.map(async (stop) => {
        const routes = await this.gtfsParser.getRoutesForStop(stop.stop_id);
        return {
          id: stop.stop_id,
          name: stop.stop_name,
          lat: stop.stop_lat,
          lon: stop.stop_lon,
          lines: routes.map((r) => ({
            id: r.route_id,
            name: r.route_short_name || r.route_long_name,
            color: r.route_color ? `#${r.route_color}` : '999999',
          })),
        };
      }),
    );

    return { stops: enriched };
  }

  // ─── GTFS — Statut / Rechargement ─────────────────────────────────────

  @Get('gtfs-status')
  async getGtfsStatus() {
    const loaded = await this.gtfsParser.isLoaded();
    return {
      loaded,
      lastLoadTime: await this.gtfsParser.getLastLoadTime(),
      stats: loaded ? await this.gtfsParser.getStats() : null,
    };
  }

  @Post('gtfs-reload')
  async reloadGtfs() {
    try {
      await this.gtfsParser.downloadAndLoad();
      return {
        success: true,
        message: 'GTFS data reloaded',
        loaded: await this.gtfsParser.isLoaded(),
      };
    } catch (error) {
      throw new HttpException(
        `Failed to reload GTFS: ${error instanceof Error ? error.message : error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Lazy load d'une shape (trajectoire réelle métro/bus) ────────────

  @Get('shape/:shapeId')
  async getShape(@Param('shapeId') shapeId?: string) {
    await this.requireGtfsLoaded();
    if (!shapeId) {
      throw new HttpException('shapeId requis', HttpStatus.BAD_REQUEST);
    }
    const points = await this.gtfsParser.getShapeById(shapeId);
    return {
      shapeId,
      points: points.map((p) => ({
        lat: p.shape_pt_lat,
        lon: p.shape_pt_lon,
        seq: p.shape_pt_sequence,
      })),
    };
  }

  // ─── Prochains départs pour un arrêt GTFS ───────────────────────────

  @Get('stop-times')
  async getStopTimes(
    @Query('stopId') stopId?: string,
    @Query('limit') limit?: string,
  ) {
    await this.requireGtfsLoaded();
    if (!stopId) {
      throw new HttpException(
        'Query parameter "stopId" is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const departures = await this.gtfsParser.getStopDepartures(
      stopId,
      new Date(),
      limit ? parseInt(limit, 10) : 5,
    );
    return { departures };
  }

  // ─── Recherche d'arrêts GTFS par nom ──────────────────────────────────

  @Get('gtfs-stops/search')
  async searchGtfsStops(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    await this.requireGtfsLoaded();
    if (!query) {
      throw new HttpException(
        'Query parameter "q" is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const stops = await this.gtfsParser.searchStopsByName(
      query,
      limit ? parseInt(limit, 10) : 10,
    );
    const results = await Promise.all(
      stops.map(async (s) => {
        const [modes, lines] = await Promise.all([
          this.gtfsParser.getStopModes(s.stop_id),
          this.gtfsParser.getStopLines(s.stop_id),
        ]);
        return {
          id: s.stop_id,
          name: s.stop_name,
          lat: s.stop_lat,
          lon: s.stop_lon,
          type: s.location_type === 1 ? 'station' : 'stop',
          platform: s.platform_code,
          // Modes desservant l'arrêt (train/métro/bus/tram…) + lignes associées.
          modes: modes.map(routeTypeLabel),
          lines: lines.map((l) => ({
            mode: routeTypeLabel(l.mode),
            name: l.name,
          })),
        };
      }),
    );
    return { total_count: results.length, results };
  }

  // ─── Compat : ancien endpoint /stops?where=search(arrname,…) ────────
  // Conservé pour rétro-compat avec l'ancien frontend / api client.
  // Extrait la valeur entre guillemets du paramètre `where` PRIM-like.
  @Get('stops')
  async getStops(
    @Query('where') where?: string,
    @Query('limit') limit?: string,
  ) {
    await this.requireGtfsLoaded();
    const match = where?.match(/search\(arrname,"([^"]+)"\)/i);
    const q = match?.[1]?.trim() ?? '';
    if (q.length < 2) {
      return { total_count: 0, results: [] };
    }
    const stops = await this.gtfsParser.searchStopsByName(
      q,
      limit ? parseInt(limit, 10) : 10,
    );
    // Mapper vers le format PrimStop (id PRIM) attendu par l'ancien frontend.
    const results = await Promise.all(
      stops.map(async (s) => {
        const [modes, lines] = await Promise.all([
          this.gtfsParser.getStopModes(s.stop_id),
          this.gtfsParser.getStopLines(s.stop_id),
        ]);
        return {
          arrid: s.stop_id,
          arrname: s.stop_name,
          arrtype: modeKey(modes[0]),
          arrmodes: modes.map(routeTypeLabel),
          arrlines: lines.map((l) => ({
            mode: routeTypeLabel(l.mode),
            name: l.name,
          })),
          arrtown: 'Paris',
          arrpostalregion: '75',
          arrgeopoint: { lon: s.stop_lon, lat: s.stop_lat },
          arraccessibility: s.wheelchair_boarding === 1 ? 'oui' : 'non',
        };
      }),
    );
    return { total_count: results.length, results };
  }

  // ─── Vélib' — Liste brute (stations Paris filtrées) ──────────────
  // Réutilisé par la Home pour la liste initiale.
  @Get('velib')
  async getVelibStations(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.primService.getVelibStations({
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  // ─── Geocoding — Recherche d'adresses + arrêts GTFS (F2, F3) ─────────

  @Get('geocode')
  async geocode(@Query('q') query?: string, @Query('limit') limit?: string) {
    if (!query) {
      throw new HttpException(
        'Query parameter "q" is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const geoResults = await this.primService.geocode(
      query,
      limit ? parseInt(limit, 10) : 5,
    );

    // Enrichir avec les arrêts GTFS locaux (gares, stations de métro…)
    const gtfsStops = await this.gtfsParser.searchStopsByName(
      query,
      limit ? parseInt(limit, 10) : 5,
    );
    const gtfsResults = await Promise.all(
      gtfsStops.map(async (s) => {
        const [modes, lines] = await Promise.all([
          this.gtfsParser.getStopModes(s.stop_id),
          this.gtfsParser.getStopLines(s.stop_id),
        ]);
        return {
          label: s.stop_name,
          score: 0.95,
          type: 'gtfs_stop',
          city: 'Paris',
          postcode: '75000',
          context: '75, Paris, Île-de-France',
          geometry: {
            type: 'Point',
            coordinates: [s.stop_lon, s.stop_lat],
          },
          gtfsStopId: s.stop_id,
          // Modes desservant l'arrêt (train/métro/bus/tram…) — précise la nature
          // de l'arrêt dans la recherche d'adresse.
          modes: modes.map(routeTypeLabel),
          lines: lines.map((l) => ({
            mode: routeTypeLabel(l.mode),
            name: l.name,
          })),
        };
      }),
    );

    // Fusionner : arrêts GTFS en premier (plus pertinents pour les transports)
    const allResults = [...gtfsResults, ...geoResults.results];
    return {
      total_count: allResults.length,
      results: allResults.slice(0, limit ? parseInt(limit, 10) : 5),
    };
  }

  // ─── Reverse Geocoding — Coordonnées → adresse (F6) ──────────────────

  @Get('reverse-geocode')
  async reverseGeocode(@Query('lat') lat?: string, @Query('lon') lon?: string) {
    if (!lat || !lon) {
      throw new HttpException(
        'Query parameters "lat" and "lon" are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.primService.reverseGeocode(parseFloat(lat), parseFloat(lon));
  }

  // ─── GTFS-RT temps réel (F3) ────────────────────────────────────────

  /**
   * Alertes/perturbations temps réel (PRIM Navitia disruptions).
   * Navitia est primaire (gtfs-rt échouait en 401 avec une clé non abonnée) ;
   * gtfs-rt reste en repli si Navitia ne répond rien.
   * Ces alertes sont également injectées dans les journeys via matchAlertsForJourney.
   */
  @Get('realtime-alerts')
  async getRealtimeAlerts() {
    try {
      const alerts = await this.navitiaService.getAlerts();
      if (alerts.length > 0) return alerts;
    } catch {
      // best-effort
    }
    return this.gtfsRtService.getAlerts();
  }

  // ─── Calcul d'itinéraire (F2) ────────────────────────────────────────

  @Get('journey')
  async findJourney(
    @Query('originLat') originLat?: string,
    @Query('originLon') originLon?: string,
    @Query('destLat') destLat?: string,
    @Query('destLon') destLon?: string,
    @Query('departureTime') departureTime?: string,
    @Query('modes') modes?: string,
    @Query('maxTransfers') maxTransfers?: string,
  ) {
    if (!originLat || !originLon || !destLat || !destLon) {
      throw new HttpException(
        'originLat, originLon, destLat, destLon are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const query: JourneyQuery = {
      origin: {
        lat: parseFloat(originLat),
        lon: parseFloat(originLon),
      },
      destination: {
        lat: parseFloat(destLat),
        lon: parseFloat(destLon),
      },
      departureTime: departureTime || undefined,
      modes: modes ? (modes.split(',') as any[]) : undefined,
      maxTransfers: maxTransfers ? parseInt(maxTransfers, 10) : undefined,
    };

    // ─── Garde périmètre : 10 km autour de Paris (scope produit) ───────
    // Au-delà, on ne propose que la marche / Vélib (fallback) — hors scope
    // transports IDF dense. Remplace l'ancien garde 30 km de journey.service.
    const PARIS = { lat: 48.8566, lon: 2.3522 };
    const originDistKm =
      this.haversineDistance(
        query.origin.lat,
        query.origin.lon,
        PARIS.lat,
        PARIS.lon,
      ) / 1000;
    const destDistKm =
      this.haversineDistance(
        query.destination.lat,
        query.destination.lon,
        PARIS.lat,
        PARIS.lon,
      ) / 1000;
    if (originDistKm > 10 || destDistKm > 10) {
      return this.computeFallbackJourney(query);
    }

    // ─── Navitia PRIMAIRE (routing temps réel + géométrie embarquée) ────
    let journeys: JourneyResult[] = [];
    let usedNavitia = false;
    if (this.navitiaService.isAvailable()) {
      try {
        journeys = await this.navitiaService.findJourneys(
          query.origin,
          query.destination,
          query.departureTime,
          query.modes,
          query.maxTransfers,
        );
        usedNavitia = journeys.length > 0;
      } catch (error) {
        // Unauthorized / quota / réseau → repli GTFS silencieux.
        this.logger.warn(
          `Navitia journeys failed, fallback to GTFS RAPTOR: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // ─── GTFS RAPTOR — filet hors-ligne (Postgres déjà chargé) ──────────
    if (journeys.length === 0 && (await this.gtfsParser.isLoaded())) {
      try {
        journeys = await this.journeyService.findJourney(query);
      } catch (error) {
        this.logger.warn(
          `GTFS RAPTOR failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // ─── Smart fallback (arrêts réels proches + marche + Vélib) ─────────
    if (journeys.length === 0) {
      return this.computeFallbackJourney(query);
    }

    // ─── Alertes : Navitia (remplace gtfs-rt mort en 401) ───────────────
    let alerts: RealtimeAlert[] = [];
    try {
      alerts = await this.navitiaService.getAlerts();
    } catch {
      // best-effort
    }
    // Repli gtfs-rt si Navitia n'a rien renvoyé ET qu'on a servi du GTFS.
    if (alerts.length === 0 && !usedNavitia) {
      try {
        alerts = await this.gtfsRtService.getAlerts();
      } catch {
        // best-effort
      }
    }

    return journeys.map((j) => ({
      ...j,
      alerts: this.matchAlertsForJourney(j, alerts),
    }));
  }

  // ─── Routing réel OSRM — Géométrie suivant les rues ──────────────────

  /**
   * Match realtime alerts against a journey's transit lines.
   * Returns alerts whose affectedRoutes overlap with the journey's line names.
   */
  private matchAlertsForJourney(
    journey: JourneyResult,
    alerts: RealtimeAlert[],
  ): RealtimeAlert[] {
    const lineNames = journey.segments
      .filter((s) => s.type === 'transit')
      .map((s) => s.lineName)
      .filter(Boolean) as string[];

    if (lineNames.length === 0 || alerts.length === 0) return [];

    const normalize = (s: string) =>
      s.toUpperCase().replace(/\s+/g, ' ').trim().replace(/[-_]/g, ' ');

    return alerts.filter((alert) =>
      alert.affectedRoutes.some((route) => {
        const nr = normalize(route);
        return lineNames.some((line) => {
          const nl = normalize(line);
          // bidirectional substring match
          return nl.includes(nr) || nr.includes(nl);
        });
      }),
    );
  }

  @Get('route')
  async getRoute(
    @Query('originLat') originLat?: string,
    @Query('originLon') originLon?: string,
    @Query('destLat') destLat?: string,
    @Query('destLon') destLon?: string,
    @Query('profile') profile?: string,
  ): Promise<OsrmRouteResult> {
    if (!originLat || !originLon || !destLat || !destLon) {
      throw new HttpException(
        'originLat, originLon, destLat, destLon are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const validProfile: 'foot' | 'bike' | 'car' =
      profile === 'bike' || profile === 'car' ? profile : 'foot';
    const result = await this.osrmService.getRoute(
      parseFloat(originLat),
      parseFloat(originLon),
      parseFloat(destLat),
      parseFloat(destLon),
      validProfile,
    );
    if (!result) {
      throw new HttpException(
        "Impossible de calculer l'itinéraire",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return result;
  }

  /**
   * Fallback intelligent — utilise les VRAIS arrêts GTFS à proximité
   * (depuis PostgreSQL) au lieu de labels génériques.
   * Calcul RAPTOR a échoué (pas de trajet trouvé) → on construit un trajet
   * plausible basé sur la distance + les arrêts réels les plus proches.
   */
  private async computeFallbackJourney(query: JourneyQuery) {
    const R = 6371;
    const dLat = ((query.destination.lat - query.origin.lat) * Math.PI) / 180;
    const dLon = ((query.destination.lon - query.origin.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((query.origin.lat * Math.PI) / 180) *
        Math.cos((query.destination.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const now = new Date();
    const departureTime = query.departureTime || now.toISOString();

    // ─── Récupérer les VRAIS arrêts à proximité (jusqu'à 500m) ─────────
    const [nearbyOriginStops, nearbyDestStops] = await Promise.all([
      this.gtfsParser.findStopsNearby(
        query.origin.lat,
        query.origin.lon,
        0.5,
        3,
      ),
      this.gtfsParser.findStopsNearby(
        query.destination.lat,
        query.destination.lon,
        0.5,
        3,
      ),
    ]);

    // Choisir les arrêts les plus pertinents (par type : métro/RER d'abord)
    const pickBestStop = async (stops: typeof nearbyOriginStops) => {
      if (stops.length === 0) return null;
      // Prioriser métro/RER/tram
      for (const s of stops) {
        const routes = await this.gtfsParser.getRoutesForStop(s.stop_id);
        if (routes.some((r) => r.route_type <= 2)) return s;
      }
      return stops[0];
    };

    const originStop = await pickBestStop(nearbyOriginStops);
    const destStop = await pickBestStop(nearbyDestStops);

    const originName = originStop?.stop_name ?? 'Position actuelle';
    const destName = destStop?.stop_name ?? 'Destination';

    // Récupérer les lignes qui desservent les arrêts réels
    const originLines = originStop
      ? await this.gtfsParser.getRoutesForStop(originStop.stop_id)
      : [];
    const destLines = destStop
      ? await this.gtfsParser.getRoutesForStop(destStop.stop_id)
      : [];

    // Lignes communes entre origine et destination (intersection)
    const originLineIds = new Set(originLines.map((l) => l.route_id));
    const commonLines = destLines.filter((l) => originLineIds.has(l.route_id));

    // Si on a une ligne directe commune → trajet direct
    // Sinon, on prend la première ligne qui passe près de l'origine
    const directLine = commonLines[0] ?? originLines[0] ?? null;

    const lineName = directLine
      ? directLine.route_short_name || directLine.route_long_name
      : null;
    const lineColor = directLine?.route_color
      ? `#${directLine.route_color}`
      : '#1A5A73';
    const lineMode = directLine
      ? directLine.route_type === 0
        ? 'tram'
        : directLine.route_type === 1
          ? 'metro'
          : directLine.route_type === 2
            ? 'rer'
            : 'bus'
      : 'transit';

    // Calcul durées réalistes
    const walkToStopMin = originStop
      ? Math.round(
          this.haversineDistance(
            query.origin.lat,
            query.origin.lon,
            originStop.stop_lat,
            originStop.stop_lon,
          ) / 80,
        ) // 80 m/min ≈ 4.8 km/h
      : 5;
    const walkFromStopMin = destStop
      ? Math.round(
          this.haversineDistance(
            query.destination.lat,
            query.destination.lon,
            destStop.stop_lat,
            destStop.stop_lon,
          ) / 80,
        )
      : 5;
    const transitMinutes = Math.max(2, Math.round((distanceKm / 22) * 60));
    const waitTime = 3; // estimation conservatrice
    const bikeMinutes = Math.round((distanceKm / 15) * 60);
    const walkMinutes = Math.round((distanceKm / 4.5) * 60);

    const journeys: JourneyResult[] = [];

    // ─── 1. Trajet transit (si on a trouvé une ligne) ─────────────────
    if (lineName) {
      journeys.push({
        durationMinutes:
          walkToStopMin + transitMinutes + walkFromStopMin + waitTime,
        transfers: 0,
        distanceKm: Math.round(distanceKm * 10) / 10,
        co2Ggrams: Math.round(
          distanceKm *
            (lineMode === 'metro' || lineMode === 'rer' || lineMode === 'tram'
              ? 3.8
              : 95),
        ),
        segments: [
          {
            type: 'walking',
            mode: 'marche',
            fromStop: 'Votre position',
            toStop: originName,
            durationMinutes: walkToStopMin,
            distanceKm: Math.round(walkToStopMin * 80) / 1000,
            co2Ggrams: 0,
            instruction: `Marcher jusqu'à ${originName} (${walkToStopMin * 80}m)`,
          },
          {
            type: 'transit',
            mode: lineMode,
            lineName: lineName,
            lineColor: lineColor,
            fromStop: originName,
            toStop: destName,
            durationMinutes: transitMinutes,
            distanceKm: Math.round(distanceKm * 10) / 10,
            numStops: Math.max(2, Math.round(distanceKm / 1.5)),
            co2Ggrams: Math.round(
              distanceKm *
                (lineMode === 'metro' ||
                lineMode === 'rer' ||
                lineMode === 'tram'
                  ? 3.8
                  : 95),
            ),
            instruction: `Prendre le ${lineMode === 'rer' ? 'RER' : lineMode.charAt(0).toUpperCase() + lineMode.slice(1)} ${lineName} de ${originName} à ${destName}`,
            direction: destName,
            headsign: destName,
            waitTimeMinutes: waitTime,
          },
          {
            type: 'walking',
            mode: 'marche',
            fromStop: destName,
            toStop: 'Destination',
            durationMinutes: walkFromStopMin,
            distanceKm: Math.round(walkFromStopMin * 80) / 1000,
            co2Ggrams: 0,
            instruction: `Marcher jusqu'à destination (${walkFromStopMin * 80}m)`,
          },
        ],
        departureTime,
        arrivalTime: new Date(
          new Date(departureTime).getTime() +
            (walkToStopMin + transitMinutes + walkFromStopMin + waitTime) *
              60000,
        ).toISOString(),
      });
    }

    // ─── 2. Vélib' (toujours) ─────────────────────────────────────────
    journeys.push({
      durationMinutes: bikeMinutes,
      transfers: 0,
      distanceKm: Math.round(distanceKm * 10) / 10,
      co2Ggrams: 0,
      segments: [
        {
          type: 'velib',
          mode: "Vélib'",
          lineName: "Vélib'",
          lineColor: '#7CB342',
          fromStop: 'Station Vélib départ',
          toStop: 'Station Vélib arrivée',
          durationMinutes: bikeMinutes,
          distanceKm: Math.round(distanceKm * 10) / 10,
          co2Ggrams: 0,
          instruction: `Vélib' → ${bikeMinutes} min · ${Math.round(distanceKm * 10) / 10} km`,
        },
      ],
      departureTime,
      arrivalTime: new Date(
        new Date(departureTime).getTime() + bikeMinutes * 60000,
      ).toISOString(),
    });

    // ─── 3. Marche (toujours) ─────────────────────────────────────────
    journeys.push({
      durationMinutes: walkMinutes,
      transfers: 0,
      distanceKm: Math.round(distanceKm * 10) / 10,
      co2Ggrams: 0,
      segments: [
        {
          type: 'walking',
          mode: 'marche',
          fromStop: 'Votre position',
          toStop: 'Destination',
          durationMinutes: walkMinutes,
          distanceKm: Math.round(distanceKm * 10) / 10,
          co2Ggrams: 0,
          instruction: `Marche → ${walkMinutes} min · ${Math.round(distanceKm * 10) / 10} km`,
        },
      ],
      departureTime,
      arrivalTime: new Date(
        new Date(departureTime).getTime() + walkMinutes * 60000,
      ).toISOString(),
    });

    return journeys;
  }

  /** Haversine local (mètres) — pour calcul distances fallback */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
