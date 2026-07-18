import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface DataApiResponse<T> {
  results?: T[];
  total_count?: number;
}

interface LineRecord {
  id_line: string;
  name_line: string;
  shortname_line: string;
  transportmode: string;
  transportsubmode: string;
  status: string;
  colourweb_hexa?: string;
}

interface ParisVelibFields {
  stationcode?: string;
  name?: string;
  coordonnees_geo?: [number, number] | number[];
  numbikesavailable?: number;
  ebike?: number;
  mechanical?: number;
  numdocksavailable?: number;
  capacity?: number;
  is_renting?: string;
  is_returning?: string;
  nom_arrondissement_communes?: string;
}

interface ParisApiRecord {
  recordid?: string;
  fields?: ParisVelibFields;
}

interface ParisApiResponse {
  records?: ParisApiRecord[];
}

interface JcdecauxStation {
  number?: number;
  name?: string;
  position?: { lat: number; lng: number };
  status?: string;
  totalStands?: {
    availabilities?: {
      bikes?: number;
      electricalBikes?: number;
      mechanicalBikes?: number;
      stands?: number;
    };
    capacity?: number;
  };
  mainStands?: {
    availabilities?: {
      bikes?: number;
      electricalBikes?: number;
      mechanicalBikes?: number;
      stands?: number;
    };
    capacity?: number;
  };
  contractName?: string;
}

interface JcdecauxApiResponse {
  records?: Array<{ fields?: JcdecauxStation }>;
  results?: JcdecauxStation[];
  nhits?: number;
}

interface GeoProperties {
  id?: string;
  label?: string;
  score?: number;
  type?: string;
  city?: string;
  postcode?: string;
  context?: string;
  housenumber?: string;
  street?: string;
}

interface GeoFeature {
  properties?: GeoProperties;
  geometry?: {
    type?: string;
    coordinates?: number[];
  };
}

interface GeoApiResponse {
  features?: GeoFeature[];
}

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

  onModuleInit() {
    this.logger.log(
      'PRIM Service initialized — Île-de-France Mobilités Open Data',
    );
  }

  /**
   * Effectue un appel authentifié à l'API PRIM
   */
  private async callPrimApi<T = unknown>(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = `${this.primApiUrl}${endpoint}`;
    const config = {
      headers: {
        ...(this.primApiKey ? { apikey: this.primApiKey } : {}),
        Accept: 'application/json',
      },
      params,
    };

    try {
      const response = await firstValueFrom(this.httpService.get(url, config));
      return response.data as T;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`PRIM API error: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Effectue un appel à l'API OpenData IDFM (données statiques)
   */
  private async callDataApi<T = unknown>(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = `${this.dataApiUrl}${endpoint}`;
    const config = { params };

    try {
      const response = await firstValueFrom(this.httpService.get(url, config));
      return response.data as T;
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

  // ─── Lignes par mode (F1) ────────────────────────────────────────────

  /**
   * Récupère les lignes clés groupées par mode de transport.
   * Retourne les lignes de Métro, RER, Tram et Transilien
   * avec leur nom court, couleur et statut.
   */
  async getLinesByMode(): Promise<{
    metro: Array<{
      id: string;
      name: string;
      shortName: string;
      color: string;
      status: string;
    }>;
    rer: Array<{
      id: string;
      name: string;
      shortName: string;
      color: string;
      status: string;
    }>;
    tram: Array<{
      id: string;
      name: string;
      shortName: string;
      color: string;
      status: string;
    }>;
    transilien: Array<{
      id: string;
      name: string;
      shortName: string;
      color: string;
      status: string;
    }>;
  }> {
    const select =
      'id_line,name_line,shortname_line,transportmode,transportsubmode,status,colourweb_hexa';

    const [metroData, rerData, tramData, transilienData] = await Promise.all([
      // Métro
      this.callDataApi<DataApiResponse<LineRecord>>(
        '/catalog/datasets/referentiel-des-lignes/records',
        {
          where: "transportmode='metro'",
          select,
          limit: '20',
          order_by: 'shortname_line',
        },
      ),
      // RER (rail + local)
      this.callDataApi<DataApiResponse<LineRecord>>(
        '/catalog/datasets/referentiel-des-lignes/records',
        {
          where: "transportmode='rail' AND transportsubmode='local'",
          select,
          limit: '10',
          order_by: 'shortname_line',
        },
      ),
      // Tram
      this.callDataApi<DataApiResponse<LineRecord>>(
        '/catalog/datasets/referentiel-des-lignes/records',
        {
          where: "transportmode='tram'",
          select,
          limit: '20',
          order_by: 'shortname_line',
        },
      ),
      // Transilien (rail + suburbanRailway)
      this.callDataApi<DataApiResponse<LineRecord>>(
        '/catalog/datasets/referentiel-des-lignes/records',
        {
          where: "transportmode='rail' AND transportsubmode='suburbanRailway'",
          select,
          limit: '20',
          order_by: 'shortname_line',
        },
      ),
    ]);

    const mapLine = (l: LineRecord) => ({
      id: l.id_line,
      name: l.name_line,
      shortName: l.shortname_line,
      color: l.colourweb_hexa || '999999',
      status: l.status,
    });

    return {
      metro: (metroData.results ?? [])
        .filter((l) => l.status === 'active')
        .map(mapLine),
      rer: (rerData.results ?? [])
        .filter((l) => l.status === 'active')
        .map(mapLine),
      tram: (tramData.results ?? [])
        .filter((l) => l.status === 'active')
        .map(mapLine),
      transilien: (transilienData.results ?? [])
        .filter((l) => l.status === 'active')
        .map(mapLine),
    };
  }

  // ─── Vélib' — Liste brute des stations (toute l'IDF) ─────────────

  /**
   * Disponibilités des stations Vélib' en temps réel
   * Dataset: jcdecaux-bike-stations-data
   * Note : endpoint conservé pour rétro-compat frontend (HomePage).
   * Pour les stations proches d'une position, utiliser /velib-nearby.
   */
  async getVelibStations(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    return this.callDataApi<unknown>(
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
        this.httpService.get<ParisApiResponse>(parisUrl, {
          params: parisParams,
        }),
      );
      const parisData = parisResponse.data;

      parisStations = (parisData.records ?? []).map((record) => {
        const f = record.fields ?? {};
        const coords = f.coordonnees_geo ?? [lat, lon];
        const stationDistance = this.haversineDistance(
          lat,
          lon,
          Number(coords[0]),
          Number(coords[1]),
        );
        return {
          id: f.stationcode ?? String(record.recordid ?? ''),
          name: f.name ?? "Station Vélib'",
          position: { lat: Number(coords[0]), lon: Number(coords[1]) },
          available_bikes: f.numbikesavailable ?? 0,
          available_ebikes: f.ebike ?? 0,
          available_mechanical: f.mechanical ?? 0,
          available_bike_stands: f.numdocksavailable ?? 0,
          capacity: f.capacity ?? 0,
          is_renting: f.is_renting === 'OUI',
          is_returning: f.is_returning === 'OUI',
          distance: Math.round(stationDistance),
          arrondissement: f.nom_arrondissement_communes ?? 'Paris',
        };
      });
    } catch (error) {
      this.logger.warn(
        `Paris Open Data API error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // ─── Source 2 : API JCDecaux IDFM (stations petite couronne / IDF hors Paris) ───
    let suburbStations: typeof parisStations = [];

    try {
      const jcdecauxData = await firstValueFrom(
        this.httpService.get<unknown>(
          `${this.dataApiUrl}/catalog/datasets/jcdecaux-bike-stations-data/records`,
          {
            params: {
              limit: String(Math.min(limit, 50)),
              where: `distance(position, geom'POINT(${lon} ${lat})', ${radiusMeters})`,
            },
          },
        ),
      );

      const raw = jcdecauxData.data as JcdecauxApiResponse;
      const records =
        raw.results ??
        (raw.records?.map((r) => r.fields) as JcdecauxStation[] | undefined) ??
        [];

      suburbStations = records
        .filter((s) => {
          if (!s.position || typeof s.position.lat !== 'number') return false;
          return (
            this.haversineDistance(lat, lon, s.position.lat, s.position.lng) <=
            radiusMeters
          );
        })
        .map((s) => {
          const stationDistance = this.haversineDistance(
            lat,
            lon,
            s.position!.lat,
            s.position!.lng,
          );
          const avail = s.mainStands?.availabilities ??
            s.totalStands?.availabilities ?? {
              bikes: 0,
              electricalBikes: 0,
              mechanicalBikes: 0,
              stands: 0,
            };
          return {
            id: String(s.number ?? s.name ?? 'unknown'),
            name: s.name ?? "Station Vélib'",
            position: {
              lat: s.position!.lat,
              lon: s.position!.lng,
            },
            available_bikes: avail.bikes ?? 0,
            available_ebikes: avail.electricalBikes ?? 0,
            available_mechanical: avail.mechanicalBikes ?? 0,
            available_bike_stands: avail.stands ?? 0,
            capacity:
              s.mainStands?.capacity ??
              s.totalStands?.capacity ??
              (avail.bikes ?? 0) + (avail.stands ?? 0),
            is_renting: s.status === 'OPEN',
            is_returning: s.status === 'OPEN',
            distance: Math.round(stationDistance),
            arrondissement: s.contractName ?? 'Île-de-France',
          };
        });
    } catch (error) {
      this.logger.warn(
        `JCDecaux fallback API error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Fusionner les sources, dédupliquer par id, trier par distance
    const seen = new Set<string>();
    const merged = [...parisStations, ...suburbStations]
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return {
      stations: merged,
      total: merged.length,
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
  async geocode(
    query: string,
    limit = 5,
  ): Promise<{
    total_count: number;
    results: Array<{
      label: string;
      score: number;
      type: string;
      city: string;
      postcode: string;
      context: string;
      geometry: GeoFeature['geometry'];
      isParis: boolean;
    }>;
  }> {
    const url = 'https://api-adresse.data.gouv.fr/search';
    const baseParams: Record<string, string> = {
      q: query,
      limit: '20', // Demander plus pour pouvoir filtrer
      lat: '48.8566', // Centre Paris
      lon: '2.3522',
    };

    const isParisResult = (f: GeoFeature) => {
      const postcode = String(f.properties?.postcode ?? '');
      const city = String(f.properties?.city ?? '').toLowerCase();
      return postcode.startsWith('75') || city === 'paris';
    };

    try {
      // Lance les deux requêtes en parallèle plutôt qu'en séquentiel :
      //  (a) city=Paris  → privilégie les adresses parisiennes
      //  (b) sans filtre → ratisse plus large (lieux, rues) en Île-de-France
      // On évite ainsi la somme des latences (~1.2s) → on paie seulement
      // la plus lente des deux (~600ms). api-adresse est gratuit/sans clé.
      const [parisRes, broadRes] = await Promise.all([
        firstValueFrom(
          this.httpService.get<GeoApiResponse>(url, {
            params: { ...baseParams, city: 'Paris' },
            timeout: 5000,
          }),
        ).catch(() => null),
        firstValueFrom(
          this.httpService.get<GeoApiResponse>(url, {
            params: baseParams,
            timeout: 5000,
          }),
        ).catch(() => null),
      ]);

      const parisFeatures = (parisRes?.data?.features ?? []).filter(
        isParisResult,
      );
      const broadFeatures = broadRes?.data?.features ?? [];

      // Fusionner (a) puis (b), en dédupliquant par id et en ne gardant que Paris
      const seen = new Set(parisFeatures.map((f) => f.properties?.id));
      for (const f of broadFeatures) {
        if (!seen.has(f.properties?.id) && isParisResult(f)) {
          parisFeatures.push(f);
          seen.add(f.properties?.id);
        }
      }

      // Normaliser la réponse pour le frontend — ne garder que Paris
      const results = parisFeatures.slice(0, limit).map((f) => ({
        label: f.properties?.label ?? '',
        score: f.properties?.score ?? 0,
        type: f.properties?.type ?? '',
        city: f.properties?.city ?? '',
        postcode: f.properties?.postcode ?? '',
        context: f.properties?.context ?? '',
        geometry: f.geometry ?? {},
        isParis: true, // Tous les résultats passent isParisResult
      }));
      return { total_count: results.length, results };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        `Geocoding API error (${err.message}) — returning empty results`,
      );
      // Return empty results instead of throwing — geocoding is non-critical
      return { total_count: 0, results: [] };
    }
  }

  // ─── Reverse Geocoding — Coordonnées → adresse ──────────────────────

  /**
   * Géocodage inverse : convertit des coordonnées (lat, lon) en adresse lisible.
   * Utilise l'API data.gouv.fr (Nominatim-like).
   */
  async reverseGeocode(
    lat: number,
    lon: number,
  ): Promise<{
    label: string;
    type: string;
    city: string;
    postcode: string;
    context?: string;
    geometry: GeoFeature['geometry'];
    housenumber?: string;
    street?: string;
    isParis: boolean;
  }> {
    const url = 'https://api-adresse.data.gouv.fr/reverse';

    try {
      const response = await firstValueFrom(
        this.httpService.get<GeoApiResponse>(url, {
          params: { lat: String(lat), lon: String(lon) },
        }),
      );

      const features = response.data?.features ?? [];
      if (features.length === 0) {
        return {
          label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          type: 'coordinates',
          city: '',
          postcode: '',
          geometry: {},
          isParis: false,
        };
      }

      const f = features[0];
      const postcode = String(f.properties?.postcode ?? '');
      const city = String(f.properties?.city ?? '').toLowerCase();
      const isParis = postcode.startsWith('75') || city === 'paris';
      return {
        label: f.properties?.label ?? '',
        type: f.properties?.type ?? '',
        city: f.properties?.city ?? '',
        postcode: f.properties?.postcode ?? '',
        context: f.properties?.context ?? '',
        geometry: f.geometry ?? {},
        housenumber: f.properties?.housenumber ?? '',
        street: f.properties?.street ?? '',
        isParis,
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Reverse geocoding API error: ${err.message}`,
        err.stack,
      );
      // Fallback : retourner les coordonnées brutes
      return {
        label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        type: 'coordinates',
        city: '',
        postcode: '',
        geometry: {},
        isParis: false,
      };
    }
  }
}
