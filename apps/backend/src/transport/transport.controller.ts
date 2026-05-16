import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrimService } from './prim.service';
import { JourneyService, JourneyQuery } from './journey.service';

/**
 * Contrôleur Transport — Expose les données PRIM (Île-de-France Mobilités)
 * au frontend UrbanFlow via des routes REST propres.
 *
 * Routes disponibles :
 * - GET /api/transport/health          → Vérification de la connexion PRIM
 * - GET /api/transport/lines           → Référentiel des lignes
 * - GET /api/transport/stops            → Référentiel des arrêts
 * - GET /api/transport/stop-lines      → Arrêts et lignes associées
 * - GET /api/transport/traffic         → Messages d'actualité / perturbations
 * - GET /api/transport/velib           → Stations Vélib' temps réel
 * - GET /api/transport/elevators       → État des ascenseurs
 * - GET /api/transport/gtfs-url        → URL de téléchargement GTFS
 */
@Controller('transport')
export class TransportController {
  constructor(
    private readonly primService: PrimService,
    private readonly journeyService: JourneyService,
  ) {}

  // ─── Santé ────────────────────────────────────────────────────────────

  @Get('health')
  async healthCheck() {
    return this.primService.healthCheck();
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

  /**
   * Fallback journey calculation when GTFS data is not loaded.
   * Uses haversine distance + estimated speeds.
   */
  private computeFallbackJourney(query: JourneyQuery) {
    const R = 6371; // Earth radius in km
    const dLat = (query.destination.lat - query.origin.lat) * Math.PI / 180;
    const dLon = (query.destination.lon - query.origin.lon) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(query.origin.lat * Math.PI / 180) *
        Math.cos(query.destination.lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Estimate transit time: ~25 km/h average for Paris transit
    const transitMinutes = Math.round((distanceKm / 25) * 60);
    const walkMinutes = Math.round((distanceKm / 4) * 60);
    const bikeMinutes = Math.round((distanceKm / 15) * 60);

    const now = new Date();
    const departureTime = query.departureTime || now.toISOString();

    return [
      {
        durationMinutes: transitMinutes + 6, // +6 min for walking to/from stops
        transfers: distanceKm > 8 ? 1 : 0,
        distanceKm: Math.round(distanceKm * 10) / 10,
        co2Ggrams: Math.round(distanceKm * 5.2), // ~5.2g CO2/km for metro
        segments: [
          {
            type: 'walking',
            mode: 'marche',
            fromStop: 'Votre position',
            toStop: 'Arrêt le plus proche',
            durationMinutes: 3,
            distanceKm: 0.2,
            co2Ggrams: 0,
            instruction: 'Marcher jusqu\'à l\'arrêt le plus proche (200m)',
          },
          {
            type: 'transit',
            mode: 'Transit',
            lineName: 'Meilleure ligne',
            lineColor: '#2E7D9B',
            fromStop: 'Arrêt départ',
            toStop: 'Arrêt arrivée',
            durationMinutes: transitMinutes,
            distanceKm: Math.round(distanceKm * 10) / 10,
            numStops: Math.max(2, Math.round(distanceKm / 1.5)),
            co2Ggrams: Math.round(distanceKm * 5.2),
            instruction: `Prendre le transit vers votre destination (${transitMinutes} min)`,
          },
          {
            type: 'walking',
            mode: 'marche',
            fromStop: 'Arrêt arrivée',
            toStop: 'Destination',
            durationMinutes: 3,
            distanceKm: 0.2,
            co2Ggrams: 0,
            instruction: 'Marcher jusqu\'à votre destination (200m)',
          },
        ],
        departureTime,
        arrivalTime: new Date(
          new Date(departureTime).getTime() + (transitMinutes + 6) * 60000,
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
            mode: 'Vélib\'',
            lineName: 'Vélib\'',
            lineColor: '#7CB342',
            fromStop: 'Station Vélib\' départ',
            toStop: 'Station Vélib\' arrivée',
            durationMinutes: bikeMinutes,
            distanceKm: Math.round(distanceKm * 10) / 10,
            co2Ggrams: 0,
            instruction: `Prendre un Vélib' (${bikeMinutes} min)`,
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
            instruction: `Marcher jusqu'à votre destination (${walkMinutes} min)`,
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