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
      'https://prim.iledefrance-mobilites.fr',
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`PRIM API error: ${err.message}`, err.stack);
      throw err;
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`IDFM Data API error: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Construit les query params à partir d'un objet partiel
   * Factorisation du pattern répété select/where/limit/offset
   */
  private buildQueryParams(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
  }): Record<string, string> {
    const queryParams: Record<string, string> = {};
    if (params?.select) queryParams.select = params.select;
    if (params?.where) queryParams.where = params.where;
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.offset) queryParams.offset = String(params.offset);
    if (params?.order_by) queryParams.order_by = params.order_by;
    return queryParams;
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
    return this.callDataApi(
      '/catalog/datasets/referentiel-des-lignes/records',
      this.buildQueryParams(params),
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
    return this.callDataApi(
      '/catalog/datasets/arrets/records',
      this.buildQueryParams(params),
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
    return this.callDataApi(
      '/catalog/datasets/arrets-lignes/records',
      this.buildQueryParams(params),
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
    return this.callDataApi(
      '/catalog/datasets/actualites/records',
      this.buildQueryParams(params),
    );
  }

  // ─── Vélib' temps réel (F1) ──────────────────────────────────────────

  /**
   * Récupère les lignes clés groupées par mode de transport.
   * Retourne les lignes de Métro, RER, Tram et Transilien
   * avec leur nom court, couleur et statut.
   */
  async getLinesByMode(): Promise<{
    metro: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    rer: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    tram: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    transilien: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
  }> {
    const select = 'id_line,name_line,shortname_line,transportmode,transportsubmode,status,colourweb_hexa';

    const [metroData, rerData, tramData, transilienData] = await Promise.all([
      // Métro
      this.callDataApi('/catalog/datasets/referentiel-des-lignes/records', {
        where: "transportmode='metro'",
        select,
        limit: '20',
        order_by: 'shortname_line',
      }),
      // RER (rail + local)
      this.callDataApi('/catalog/datasets/referentiel-des-lignes/records', {
        where: "transportmode='rail' AND transportsubmode='local'",
        select,
        limit: '10',
        order_by: 'shortname_line',
      }),
      // Tram
      this.callDataApi('/catalog/datasets/referentiel-des-lignes/records', {
        where: "transportmode='tram'",
        select,
        limit: '20',
        order_by: 'shortname_line',
      }),
      // Transilien (rail + suburbanRailway)
      this.callDataApi('/catalog/datasets/referentiel-des-lignes/records', {
        where: "transportmode='rail' AND transportsubmode='suburbanRailway'",
        select,
        limit: '20',
        order_by: 'shortname_line',
      }),
    ]);

    const mapLine = (l: any) => ({
      id: l.id_line,
      name: l.name_line,
      shortName: l.shortname_line,
      color: l.colourweb_hexa || '999999',
      status: l.status,
    });

    return {
      metro: (metroData?.results || []).filter((l: any) => l.status === 'active').map(mapLine),
      rer: (rerData?.results || []).filter((l: any) => l.status === 'active').map(mapLine),
      tram: (tramData?.results || []).filter((l: any) => l.status === 'active').map(mapLine),
      transilien: (transilienData?.results || []).filter((l: any) => l.status === 'active').map(mapLine),
    };
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
    return this.callDataApi(
      '/catalog/datasets/jcdecaux-bike-stations-data/records',
      this.buildQueryParams(params),
    );
  }

  // ─── Vélib' proches — Stations à proximité (F4) ──────────────────────

  /**
   * Récupère les stations Vélib' les plus proches d'une position donnée.
   * Utilise l'API Open Data Paris (opendata.paris.fr) avec geofilter.distance
   * pour les stations Paris intra-muros (75), et l'API IDFM JCDecaux
   * pour les stations en banlieue proche.
   * Retourne les N plus proches triées par distance.
   */
  async getNearbyVelibStations(
    lat: number,
    lon: number,
    radiusKm = 2,
    limit = 10,
  ): Promise<{
    stations: Array<{
      id: string;
      name: string;
      position: { lon: number; lat: number };
      available_bikes: number;
      available_ebikes: number;
      available_mechanical: number;
      available_bike_stands: number;
      capacity: number;
      is_renting: boolean;
      is_returning: boolean;
      distance: number; // en mètres
      arrondissement: string;
    }>;
    total: number;
  }> {
    const radiusMeters = Math.round(radiusKm * 1000);

    // ─── Source 1 : Open Data Paris (Vélib' Métropole — Paris intra-muros) ───
    const parisUrl = `https://opendata.paris.fr/api/records/1.0/search/`;
    const parisParams: Record<string, string> = {
      dataset: 'velib-disponibilite-en-temps-reel',
      rows: String(Math.min(limit, 50)),
      'geofilter.distance': `${lat},${lon},${radiusMeters}`,
      sort: '-numbikesavailable',
    };

    let parisStations: Array<{
      id: string;
      name: string;
      position: { lon: number; lat: number };
      available_bikes: number;
      available_ebikes: number;
      available_mechanical: number;
      available_bike_stands: number;
      capacity: number;
      is_renting: boolean;
      is_returning: boolean;
      distance: number;
      arrondissement: string;
    }> = [];

    try {
      const parisResponse = await firstValueFrom(
        this.httpService.get(parisUrl, { params: parisParams }),
      );
      const parisData = parisResponse.data;

      parisStations = (parisData?.records || []).map((record: any) => {
        const f = record.fields || {};
        const coords = f.coordonnees_geo || [lat, lon];
        const stationDistance = this.haversineDistance(
          lat, lon, coords[0], coords[1],
        );
        return {
          id: f.stationcode || String(record.recordid || ''),
          name: f.name || 'Station Vélib\'',
          position: { lat: coords[0], lon: coords[1] },
          available_bikes: f.numbikesavailable || 0,
          available_ebikes: f.ebike || 0,
          available_mechanical: f.mechanical || 0,
          available_bike_stands: f.numdocksavailable || 0,
          capacity: f.capacity || 0,
          is_renting: f.is_renting === 'OUI',
          is_returning: f.is_returning === 'OUI',
          distance: Math.round(stationDistance),
          arrondissement: f.nom_arrondissement_communes || 'Paris',
        };
      });
    } catch (error) {
      this.logger.warn(`Paris Open Data API error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Trier par distance et limiter
    const sorted = parisStations
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return {
      stations: sorted,
      total: sorted.length,
    };
  }

  /**
   * Calcule la distance entre deux points GPS en mètres (formule de Haversine)
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
    return this.callDataApi(
      '/catalog/datasets/etat-des-ascenseurs/records',
      this.buildQueryParams(params),
    );
  }

  // ─── GTFS — Téléchargement ───────────────────────────────────────────

  /**
   * URL de téléchargement du GTFS statique (offre horaires)
   * Nécessite une clé API PRIM
   * Note: l'ancien endpoint /v1/gtfs/static/download est obsolète.
   * On utilise maintenant le portail data.iledefrance-mobilites.fr
   */
  getGtfsStaticDownloadUrl(): string {
    return 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/offre-horaires-tc-gtfs-idfm/exports/zip';
  }

  /**
   * URL du flux GTFS-RT (temps réel)
   * Nécessite une clé API PRIM
   * Note: l'ancien endpoint /v1/gtfs-rt est obsolète.
   * On utilise maintenant l'API Navitia disruptions comme fallback
   */
  getGtfsRtFeedUrl(): string {
    return `${this.primApiUrl}/marketplace/v2/navitia/disruptions`;
  }

  // ─── Geocoding — Recherche d'adresses (data.gouv.fr) ────────────────

  /**
   * Recherche d'adresses via l'API Adresse data.gouv.fr
   * https://api-adresse.data.gouv.fr/
   * Gratuit, sans clé, couvre toutes les adresses françaises
   *
   * Centre la recherche sur Paris (48.8566, 2.3522) pour
   * privilégier les résultats en Île-de-France.
   * Essaie d'abord "housenumber" (adresse précise), puis
   * sans filtre de type si aucun résultat (lieux, rues).
   */
  async geocode(query: string, limit = 5): Promise<any> {
    const url = 'https://api-adresse.data.gouv.fr/search';
    const baseParams: Record<string, string> = {
      q: query,
      limit: '20',      // Demander plus pour pouvoir filtrer
      lat: '48.8566',   // Centre Paris
      lon: '2.3522',
    };

    const isParisResult = (f: any) => {
      const postcode = String(f.properties?.postcode || '');
      const city = String(f.properties?.city || '').toLowerCase();
      return postcode.startsWith('75') || city === 'paris';
    };

    try {
      // 1) Essai avec city=Paris (privilégie les adresses parisiennes)
      let response = await firstValueFrom(
        this.httpService.get(url, {
          params: { ...baseParams, city: 'Paris' },
          timeout: 5000,
        }),
      );
      let features = response.data?.features || [];

      // 2) Si pas assez de résultats parisiens, essayer sans filtre city
      // mais ne garder que les résultats en Île-de-France (postcode 75/92/93/94/77/78/91/95)
      const parisFeatures = features.filter(isParisResult);
      if (parisFeatures.length < limit) {
        response = await firstValueFrom(
          this.httpService.get(url, {
            params: baseParams,
            timeout: 5000,
          }),
        );
        const allFeatures = response.data?.features || [];
        // Fusionner et dédupliquer par id
        const seen = new Set(parisFeatures.map((f: any) => f.properties?.id));
        for (const f of allFeatures) {
          if (!seen.has(f.properties?.id) && isParisResult(f)) {
            parisFeatures.push(f);
          }
        }
      }

      // Normaliser la réponse pour le frontend — ne garder que Paris
      const results = parisFeatures.slice(0, limit).map((f: any) => ({
        label: f.properties?.label || '',
        score: f.properties?.score || 0,
        type: f.properties?.type || '',
        city: f.properties?.city || '',
        postcode: f.properties?.postcode || '',
        context: f.properties?.context || '',
        geometry: f.geometry || {},
        isParis: true, // Tous les résultats passent isParisResult
      }));
      return { total_count: results.length, results };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(`Geocoding API error (${err.message}) — returning empty results`);
      // Return empty results instead of throwing — geocoding is non-critical
      return { total_count: 0, results: [] };
    }
  }

  // ─── Reverse Geocoding — Coordonnées → adresse ──────────────────────

  /**
   * Géocodage inverse : convertit des coordonnées (lat, lon) en adresse lisible.
   * Utilise l'API data.gouv.fr (Nominatim-like).
   */
  async reverseGeocode(lat: number, lon: number): Promise<any> {
    const url = 'https://api-adresse.data.gouv.fr/reverse';

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: { lat: String(lat), lon: String(lon) },
        }),
      );

      const features = response.data?.features || [];
      if (features.length === 0) {
        return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, type: 'coordinates', city: '', postcode: '', isParis: false };
      }

      const f = features[0];
      const postcode = String(f.properties?.postcode || '');
      const city = String(f.properties?.city || '').toLowerCase();
      const isParis = postcode.startsWith('75') || city === 'paris';
      return {
        label: f.properties?.label || '',
        type: f.properties?.type || '',
        city: f.properties?.city || '',
        postcode: f.properties?.postcode || '',
        context: f.properties?.context || '',
        geometry: f.geometry || {},
        housenumber: f.properties?.housenumber || '',
        street: f.properties?.street || '',
        isParis,
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Reverse geocoding API error: ${err.message}`, err.stack);
      // Fallback : retourner les coordonnées brutes
      return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, type: 'coordinates', city: '', postcode: '', isParis: false };
    }
  }

  // ─── Agrégation par mode de transport ────────────────────────────────

  /**
   * Récupère le nombre de lignes par mode de transport (métro, RER, tram, bus, Transilien)
   * Utilise le référentiel des lignes PRIM pour compter les lignes actives.
   * Les modes sont agrégés depuis transportmode + transportsubmode :
   *   - metro → Métro
   *   - rail + local → RER
   *   - rail + suburbanRailway → Transilien
   *   - rail + railShuttle → Navettes (CDG VAL, ORLYVAL)
   *   - rail + regionalRail → TER
   *   - tram → Tram
   *   - bus → Bus
   *   - cableway → Téléphérique
   */
  async getTransportModes(): Promise<{
    modes: Array<{
      key: string;
      label: string;
      emoji: string;
      color: string;
      count: number;
      activeCount: number;
      lines: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    }>;
  }> {
    // Définition des modes attendus avec leurs filtres PRIM
    const modeQueries: Record<string, { transportmode: string; transportsubmode?: string; label: string; emoji: string; color: string }> = {
      metro: { transportmode: 'metro', label: 'Métro', emoji: '🚇', color: '#2E7D9B' },
      rer: { transportmode: 'rail', transportsubmode: 'local', label: 'RER', emoji: '🚉', color: '#FF6B35' },
      transilien: { transportmode: 'rail', transportsubmode: 'suburbanRailway', label: 'Transilien', emoji: '🚆', color: '#7CB342' },
      tram: { transportmode: 'tram', label: 'Tram', emoji: '🚊', color: '#9C27B0' },
      bus: { transportmode: 'bus', label: 'Bus', emoji: '🚌', color: '#FF9800' },
    };

    const modes: Array<{
      key: string;
      label: string;
      emoji: string;
      color: string;
      count: number;
      activeCount: number;
      lines: Array<{ id: string; name: string; shortName: string; color: string; status: string }>;
    }> = [];

    for (const [key, config] of Object.entries(modeQueries)) {
      try {
        // Construire le filtre where
        let where = `transportmode='${config.transportmode}'`;
        if (config.transportsubmode) {
          where += ` AND transportsubmode='${config.transportsubmode}'`;
        }

        const data = await this.callDataApi(
          '/catalog/datasets/referentiel-des-lignes/records',
          {
            where,
            select: 'id_line,name_line,shortname_line,transportmode,transportsubmode,status,colourweb_hexa',
            limit: '100',
          },
        );

        const results = data?.results || [];
        const totalCount = data?.total_count || results.length;
        const activeLines = results.filter((l: any) => l.status === 'active');
        const topLines = activeLines
          .slice(0, 8)
          .map((l: any) => ({
            id: l.id_line,
            name: l.name_line,
            shortName: l.shortname_line,
            color: l.colourweb_hexa || '999999',
            status: l.status,
          }));

        modes.push({
          key,
          label: config.label,
          emoji: config.emoji,
          color: config.color,
          count: totalCount,
          activeCount: activeLines.length,
          lines: topLines,
        });
      } catch (error) {
        this.logger.warn(`Failed to fetch mode ${key}: ${error instanceof Error ? error.message : String(error)}`);
        modes.push({
          key,
          label: config.label,
          emoji: config.emoji,
          color: config.color,
          count: 0,
          activeCount: 0,
          lines: [],
        });
      }
    }

    return { modes };
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