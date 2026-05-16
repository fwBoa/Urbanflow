import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrimService } from './prim.service';

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
  constructor(private readonly primService: PrimService) {}

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
}