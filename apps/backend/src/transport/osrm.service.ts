import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface OsrmRouteResult {
  geometry: { type: string; coordinates: [number, number][] };
  distance: number;
  duration: number;
}

interface OsrmApiResponse {
  routes?: Array<{
    geometry: OsrmRouteResult['geometry'];
    distance: number;
    duration: number;
  }>;
}

/**
 * Service OSRM — Routing OpenStreetMap
 *
 * Utilise l'API publique OSRM (Project-OSRM) pour obtenir
 * la géométrie réelle d'un itinéraire (suivant les rues).
 *
 * Endpoint : https://router.project-osrm.org/route/v1/{profile}/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson
 *
 * Profils : driving, walking, cycling
 */
@Injectable()
export class OsrmService {
  private readonly logger = new Logger(OsrmService.name);
  private readonly baseUrl = 'https://router.project-osrm.org/route/v1';

  /** Cache court-terme pour éviter de re-frapper OSRM pour des trajets identiques.
   *  Clé : "lat1,lon1,lat2,lon2,profile". TTL 5 min, max 500 entrées. */
  private readonly cache = new Map<
    string,
    { result: OsrmRouteResult; expiry: number }
  >();
  private readonly CACHE_TTL_MS = 300_000;
  private readonly CACHE_MAX_SIZE = 500;

  /** In-flight requests pour déduplication : même requête lancée 2x → 1 seul appel OSRM */
  private readonly inflight = new Map<
    string,
    Promise<OsrmRouteResult | null>
  >();

  constructor(private readonly httpService: HttpService) {}

  /**
   * Calcule un itinéraire routier entre deux points.
   *
   * @param originLat - Latitude du point de départ
   * @param originLon - Longitude du point de départ
   * @param destLat - Latitude du point d'arrivée
   * @param destLon - Longitude du point d'arrivée
   * @param profile - Profil de routing : 'foot' | 'bike' | 'car' (défaut: foot)
   * @returns Géométrie GeoJSON + distance + durée
   */
  async getRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
    profile: 'foot' | 'bike' | 'car' = 'foot',
  ): Promise<OsrmRouteResult | null> {
    const osrmProfile =
      profile === 'bike' ? 'cycling' : profile === 'car' ? 'driving' : 'foot';
    const cacheKey = `${originLat.toFixed(5)},${originLon.toFixed(5)},${destLat.toFixed(5)},${destLon.toFixed(5)},${osrmProfile}`;

    // 1) Cache hit ?
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return cached.result;
    }

    // 2) Requête déjà en cours (dedup) ?
    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;

    // 3) Appel OSRM
    const url = `${this.baseUrl}/${osrmProfile}/${originLon},${originLat};${destLon},${destLat}`;
    const fetchPromise = (async () => {
      try {
        const response = await firstValueFrom(
          this.httpService.get<OsrmApiResponse>(url, {
            params: {
              overview: 'full',
              geometries: 'geojson',
              alternatives: 'false',
              steps: 'false',
            },
          }),
        );

        const route = response.data.routes?.[0];
        if (!route) {
          this.logger.warn(
            `OSRM: aucune route trouvée pour ${originLat},${originLon} → ${destLat},${destLon}`,
          );
          return null;
        }

        const result = {
          geometry: route.geometry,
          distance: route.distance,
          duration: route.duration,
        };

        // Mise en cache
        if (this.cache.size >= this.CACHE_MAX_SIZE) {
          const first = this.cache.keys().next().value as string | undefined;
          if (first !== undefined) this.cache.delete(first);
        }
        this.cache.set(cacheKey, {
          result,
          expiry: Date.now() + this.CACHE_TTL_MS,
        });
        return result;
      } catch (error: unknown) {
        this.logger.error(
          `OSRM API error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      } finally {
        this.inflight.delete(cacheKey);
      }
    })();

    this.inflight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }
}
