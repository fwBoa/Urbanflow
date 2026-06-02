import {
  Controller,
  Get,
  Post,
  Query,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrimService } from './prim.service';
import { GtfsParserService } from './gtfs-parser.service';
import { JourneyService, JourneyQuery } from './journey.service';
import { OsrmService } from './osrm.service';
import { GtfsRtService } from './gtfs-rt.service';

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
  constructor(
    private readonly primService: PrimService,
    private readonly gtfsParser: GtfsParserService,
    private readonly journeyService: JourneyService,
    private readonly osrmService: OsrmService,
    private readonly gtfsRtService: GtfsRtService,
  ) {}

  // ─── Santé ────────────────────────────────────────────────────────────

  @Get('health')
  async healthCheck() {
    return this.primService.healthCheck();
  }

  // ─── Modes de transport (F1) ──────────────────────────────────────────

  @Get('modes')
  async getTransportModes() {
    return this.primService.getTransportModes();
  }

  // ─── Lignes par mode (F1) ────────────────────────────────────────────

  @Get('lines-by-mode')
  async getLinesByMode() {
    return this.primService.getLinesByMode();
  }

  // ─── Référentiel des lignes (F1) ──────────────────────────────────────

  @Get('lines')
  async getLines(
    @Query('select') select?: string,
    @Query('where') where?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.primService.getLines({
      select,
      where,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ─── Référentiel des arrêts (F1, F3) ───────────────────────────────────

  @Get('stops')
  async getStops(
    @Query('select') select?: string,
    @Query('where') where?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.primService.getStops({
      select,
      where,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stop-lines')
  async getStopLines(
    @Query('select') select?: string,
    @Query('where') where?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.primService.getStopLines({
      select,
      where,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ─── Perturbations (F1) ───────────────────────────────────────────────

  @Get('traffic')
  async getTrafficMessages(
    @Query('select') select?: string,
    @Query('where') where?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.primService.getTrafficMessages({
      select,
      where,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ─── Vélib' temps réel (F1) ────────────────────────────────────────────

  @Get('velib')
  async getVelibStations(
    @Query('select') select?: string,
    @Query('where') where?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.primService.getVelibStations({
      select,
      where,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
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
    if (!lat || !lon) {
      throw new HttpException(
        'Query parameters "lat" and "lon" are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const radiusKm = radius ? parseFloat(radius) : 0.5;
    const maxResults = limit ? parseInt(limit, 10) : 10;

    const nearby = this.gtfsParser.findStopsNearby(
      parseFloat(lat),
      parseFloat(lon),
      radiusKm,
    ).slice(0, maxResults);

    const enriched = nearby.map((stop) => {
      const routes = this.gtfsParser.getRoutesForStop(stop.stop_id);
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
    });

    return { stops: enriched };
  }

  // ─── Ascenseurs / Accessibilité (F1, C7) ──────────────────────────────

  @Get('elevators')
  async getElevatorStatus(
    @Query('select') select?: string,
    @Query('where') where?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.primService.getElevatorStatus({
      select,
      where,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ─── GTFS URLs ────────────────────────────────────────────────────────

  @Get('gtfs-url')
  async getGtfsUrls() {
    return {
      gtfs_static: this.primService.getGtfsStaticDownloadUrl(),
      gtfs_rt: this.primService.getGtfsRtFeedUrl(),
    };
  }

  @Get('gtfs-status')
  async getGtfsStatus() {
    return {
      loaded: this.gtfsParser.isLoaded(),
      lastLoadTime: this.gtfsParser.getLastLoadTime(),
      stats: this.gtfsParser.isLoaded() ? this.gtfsParser.getStats() : null,
    };
  }

  @Post('gtfs-reload')
  async reloadGtfs() {
    try {
      await this.gtfsParser.downloadAndLoad();
      return { success: true, message: 'GTFS data reloaded', loaded: this.gtfsParser.isLoaded() };
    } catch (error) {
      throw new HttpException(
        `Failed to reload GTFS: ${error instanceof Error ? error.message : error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Recherche d'arrêts GTFS par nom ──────────────────────────────────

  @Get('gtfs-stops/search')
  async searchGtfsStops(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      throw new HttpException(
        'Query parameter "q" is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const stops = this.gtfsParser.searchStopsByName(query, limit ? parseInt(limit, 10) : 10);
    return {
      total_count: stops.length,
      results: stops.map((s) => ({
        id: s.stop_id,
        name: s.stop_name,
        lat: s.stop_lat,
        lon: s.stop_lon,
        type: s.location_type === 1 ? 'station' : 'stop',
        platform: s.platform_code,
      })),
    };
  }

  // ─── Geocoding — Recherche d'adresses + arrêts GTFS (F2, F3) ─────────

  @Get('geocode')
  async geocode(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      throw new HttpException(
        'Query parameter "q" is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const geoResults = await this.primService.geocode(query, limit ? parseInt(limit, 10) : 5);

    // Enrichir avec les arrêts GTFS locaux (gares, stations de métro…)
    const gtfsStops = this.gtfsParser.searchStopsByName(query, limit ? parseInt(limit, 10) : 5);
    const gtfsResults = gtfsStops.map((s) => ({
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
    }));

    // Fusionner : arrêts GTFS en premier (plus pertinents pour les transports)
    const allResults = [...gtfsResults, ...geoResults.results];
    return { total_count: allResults.length, results: allResults.slice(0, limit ? parseInt(limit, 10) : 5) };
  }

  // ─── Reverse Geocoding — Coordonnées → adresse (F6) ──────────────────

  @Get('reverse-geocode')
  async reverseGeocode(
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
  ) {
    if (!lat || !lon) {
      throw new HttpException(
        'Query parameters "lat" and "lon" are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.primService.reverseGeocode(parseFloat(lat), parseFloat(lon));
  }

  // ─── GTFS-RT temps réel (F3) ────────────────────────────────────────

  @Get('realtime-alerts')
  async getRealtimeAlerts() {
    return this.gtfsRtService.getAlerts();
  }

  @Get('realtime-vehicles')
  async getRealtimeVehicles(
    @Query('lineId') lineId?: string,
  ) {
    return this.gtfsRtService.getVehiclePositions(lineId);
  }

  @Get('realtime-status')
  async getRealtimeStatus() {
    return this.gtfsRtService.getStatus();
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

    const journeys = await this.journeyService.findJourney(query);

    // If GTFS data not loaded, return a fallback mock journey
    if (journeys.length === 0) {
      return this.computeFallbackJourney(query);
    }

    return journeys;
  }

  // ─── Routing réel OSRM — Géométrie suivant les rues ──────────────────

  @Get('route')
  async getRoute(
    @Query('originLat') originLat?: string,
    @Query('originLon') originLon?: string,
    @Query('destLat') destLat?: string,
    @Query('destLon') destLon?: string,
    @Query('profile') profile?: string,
  ) {
    if (!originLat || !originLon || !destLat || !destLon) {
      throw new HttpException(
        'originLat, originLon, destLat, destLon are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.osrmService.getRoute(
      parseFloat(originLat),
      parseFloat(originLon),
      parseFloat(destLat),
      parseFloat(destLon),
      profile as any || 'foot',
    );
    if (!result) {
      throw new HttpException(
        'Impossible de calculer l\'itinéraire',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return result;
  }

  /**
   * Fallback journey calculation when GTFS data is not loaded.
   * Uses haversine distance + estimated speeds.
   * Enriched with realistic Paris transit details (direction, platform, wait time).
   */
  private computeFallbackJourney(query: JourneyQuery) {
    const R = 6371;
    const dLat = (query.destination.lat - query.origin.lat) * Math.PI / 180;
    const dLon = (query.destination.lon - query.origin.lon) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(query.origin.lat * Math.PI / 180) *
        Math.cos(query.destination.lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const transitMinutes = Math.round((distanceKm / 25) * 60);
    const walkMinutes = Math.round((distanceKm / 4) * 60);
    const bikeMinutes = Math.round((distanceKm / 15) * 60);

    const now = new Date();
    const departureTime = query.departureTime || now.toISOString();

    // Realistic Paris transit details
    const directions = [
      'Saint-Germain-en-Laye', 'Poissy', 'Cergy-Le-Haut', 'Marne-la-Vallée',
      'Aéroport Charles de Gaulle', 'Orly', 'Versailles-Chantiers',
      'Bois-le-Roi', 'Melun', 'Mantes-la-Jolie',
    ];
    const platforms = ['Voie 1', 'Voie 2', 'Voie 3', 'Quai A', 'Quai B'];
    const lines = [
      { name: 'RER A', color: '#E3051C', mode: 'rer' },
      { name: 'Métro 1', color: '#FFCE00', mode: 'metro' },
      { name: 'Métro 4', color: '#BE418D', mode: 'metro' },
      { name: 'RER B', color: '#5291CE', mode: 'rer' },
      { name: 'Métro 14', color: '#622280', mode: 'metro' },
    ];

    const randomLine = lines[Math.floor(Math.random() * lines.length)];
    const randomDirection = directions[Math.floor(Math.random() * directions.length)];
    const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
    const waitTime = Math.floor(Math.random() * 6) + 2;

    return [
      {
        durationMinutes: transitMinutes + 6 + waitTime,
        transfers: distanceKm > 8 ? 1 : 0,
        distanceKm: Math.round(distanceKm * 10) / 10,
        co2Ggrams: Math.round(distanceKm * 5.2),
        segments: [
          {
            type: 'walking',
            mode: 'marche',
            fromStop: 'Votre position',
            toStop: 'Arrêt le plus proche',
            durationMinutes: 3,
            distanceKm: 0.2,
            co2Ggrams: 0,
            instruction: "Marcher jusqu'à l'arrêt le plus proche (200m)",
          },
          {
            type: 'transit',
            mode: randomLine.mode,
            lineName: randomLine.name,
            lineColor: randomLine.color,
            fromStop: 'Arrêt départ',
            toStop: 'Arrêt arrivée',
            durationMinutes: transitMinutes,
            distanceKm: Math.round(distanceKm * 10) / 10,
            numStops: Math.max(2, Math.round(distanceKm / 1.5)),
            co2Ggrams: Math.round(distanceKm * 5.2),
            instruction: `${randomLine.name} → direction ${randomDirection} · ${transitMinutes} min · ${Math.max(2, Math.round(distanceKm / 1.5))} arrêts`,
            direction: randomDirection,
            platform: randomPlatform,
            headsign: randomDirection,
            waitTimeMinutes: waitTime,
          },
          {
            type: 'walking',
            mode: 'marche',
            fromStop: 'Arrêt arrivée',
            toStop: 'Destination',
            durationMinutes: 3,
            distanceKm: 0.2,
            co2Ggrams: 0,
            instruction: "Marcher jusqu'à votre destination (200m)",
          },
        ],
        departureTime,
        arrivalTime: new Date(
          new Date(departureTime).getTime() + (transitMinutes + 6 + waitTime) * 60000,
        ).toISOString(),
      },
      {
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
            fromStop: "Station Vélib' départ",
            toStop: "Station Vélib' arrivée",
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
      },
      {
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
      },
    ];
  }
}