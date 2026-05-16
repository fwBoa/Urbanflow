import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Service d'intégration avec la plateforme PRIM (Île-de-France Mobilités)
 * https://prim.iledefrance-mobilites.fr/
 *
 * PRIM fournit :
 * - 90 jeux de données (GTFS statiques, référentiels, géographie...)
 * - 15 API (horaires temps réel, SIRI, disponibilités Vélib'...)
 * - 1 widget
 *
 * Données clés pour UrbanFlow :
 * - GTFS statiques : offre de transport (horaires, parcours, lignes, arrêts, correspondances)
 *   Mis à jour 3 fois/jour (8h, 13h, 17h), couvre les 30 prochains jours
 * - GTFS-RT : temps réel (retards, suppressions, positions véhicules)
 * - Référentiel des lignes : liste des lignes commerciales actives
 * - Référentiel des arrêts : arrêts, zones d'arrêt, correspondances
 * - Messages d'actualité : perturbations et infos trafic
 * - Disponibilités Vélib' : stations et vélos en temps réel
 * - État des ascenseurs : accessibilité en temps réel
 */
@Injectable()
export class PrimService implements OnModuleInit {
  private readonly logger = new Logger(PrimService.name);
  private readonly primApiUrl: string;
  private readonly primApiKey: string;
  private readonly dataApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.primApiUrl = this.configService.get<string>(
      'PRIM_API_URL',
      'https://api-lab.idfm.fr',
    );
    this.primApiKey = this.configService.get<string>('PRIM_API_KEY', '');
    this.dataApiUrl = this.configService.get<string>(
      'IDFM_DATA_API_URL',
      'https://data.iledefrance-mobilites.fr/api/explore/v2.1',
    );

    if (!this.primApiKey) {
      this.logger.warn(
        'PRIM_API_KEY is not set. Some API calls will fail. Register at https://prim.iledefrance-mobilites.fr/',
      );
    }
  }

  async onModuleInit() {
    this.logger.log('PRIM Service initialized — Île-de-France Mobilités Open Data');
  }

  /**
   * Effectue un appel authentifié à l'API PRIM
   */
  private async callPrimApi(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<any> {
    const url = `${this.primApiUrl}${endpoint}`;
    const config = {
      headers: {
        ...(this.primApiKey ? { apikey: this.primApiKey } : {}),
        Accept: 'application/json',
      },
      params,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, config),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`PRIM API error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Effectue un appel à l'API OpenData IDFM (données statiques)
   */
  private async callDataApi(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<any> {
    const url = `${this.dataApiUrl}${endpoint}`;
    const config = { params };

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, config),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`IDFM Data API error: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ─── Référentiel des lignes (F1) ──────────────────────────────────────

  /**
   * Récupère le référentiel des lignes de transport
   * Dataset: referentiel-des-lignes
   */
  async getLines(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params?.select) queryParams.select = params.select;
    if (params?.where) queryParams.where = params.where;
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.offset) queryParams.offset = String(params.offset);

    return this.callDataApi(
      '/catalog/datasets/referentiel-des-lignes/records',
      queryParams,
    );
  }

  // ─── Référentiel des arrêts (F1, F3) ─────────────────────────────────

  /**
   * Récupère le référentiel des arrêts
   * Dataset: arrets
   */
  async getStops(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params?.select) queryParams.select = params.select;
    if (params?.where) queryParams.where = params.where;
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.offset) queryParams.offset = String(params.offset);

    return this.callDataApi(
      '/catalog/datasets/arrets/records',
      queryParams,
    );
  }

  /**
   * Récupère les arrêts et lignes associées
   * Dataset: arrets-lignes
   */
  async getStopLines(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params?.select) queryParams.select = params.select;
    if (params?.where) queryParams.where = params.where;
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.offset) queryParams.offset = String(params.offset);

    return this.callDataApi(
      '/catalog/datasets/arrets-lignes/records',
      queryParams,
    );
  }

  // ─── Messages d'actualité / Perturbations (F1) ───────────────────────

  /**
   * Récupère les messages d'actualité (perturbations, travaux)
   * Dataset: actualites
   */
  async getTrafficMessages(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params?.select) queryParams.select = params.select;
    if (params?.where) queryParams.where = params.where;
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.offset) queryParams.offset = String(params.offset);

    return this.callDataApi(
      '/catalog/datasets/actualites/records',
      queryParams,
    );
  }

  // ─── Vélib' temps réel (F1) ──────────────────────────────────────────

  /**
   * Disponibilités des stations Vélib' en temps réel
   * Dataset: jcdecaux-bike-stations-data
   */
  async getVelibStations(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params?.select) queryParams.select = params.select;
    if (params?.where) queryParams.where = params.where;
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.offset) queryParams.offset = String(params.offset);

    return this.callDataApi(
      '/catalog/datasets/jcdecaux-bike-stations-data/records',
      queryParams,
    );
  }

  // ─── Ascenseurs / Accessibilité (F1, C7) ────────────────────────────

  /**
   * État des ascenseurs en temps réel
   * Dataset: etat-des-ascenseurs
   */
  async getElevatorStatus(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const queryParams: Record<string, string> = {};

    if (params?.select) queryParams.select = params.select;
    if (params?.where) queryParams.where = params.where;
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.offset) queryParams.offset = String(params.offset);

    return this.callDataApi(
      '/catalog/datasets/etat-des-ascenseurs/records',
      queryParams,
    );
  }

  // ─── GTFS — Téléchargement ───────────────────────────────────────────

  /**
   * URL de téléchargement du GTFS statique (offre horaires)
   * Nécessite une clé API PRIM
   */
  getGtfsStaticDownloadUrl(): string {
    return `${this.primApiUrl}/gtfs/v1/idfm-gtfs-static.zip`;
  }

  /**
   * URL du flux GTFS-RT (temps réel)
   * Nécessite une clé API PRIM
   */
  getGtfsRtFeedUrl(): string {
    return `${this.primApiUrl}/gtfs-rt/v1`;
  }

  // ─── Santé du service ────────────────────────────────────────────────

  /**
   * Vérifie que l'API PRIM est accessible
   */
  async healthCheck(): Promise<{
    status: string;
    source: string;
    apiKeyConfigured: boolean;
  }> {
    try {
      await this.callDataApi('/catalog/datasets/referentiel-des-lignes/records', {
        limit: '1',
      });
      return {
        status: 'ok',
        source: 'PRIM Île-de-France Mobilités',
        apiKeyConfigured: !!this.primApiKey,
      };
    } catch (error) {
      return {
        status: 'error',
        source: 'PRIM Île-de-France Mobilités',
        apiKeyConfigured: !!this.primApiKey,
      };
    }
  }
}