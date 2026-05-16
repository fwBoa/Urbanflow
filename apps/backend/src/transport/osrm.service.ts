import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
  ): Promise<{
    geometry: { type: string; coordinates: [number, number][] };
    distance: number; // mètres
    duration: number; // secondes
  } | null> {
    const osrmProfile = profile === 'bike' ? 'cycling' : profile === 'car' ? 'driving' : 'foot';
    const url = `${this.baseUrl}/${osrmProfile}/${originLon},${originLat};${destLon},${destLat}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            overview: 'full',
            geometries: 'geojson',
            alternatives: 'false',
            steps: 'false',
          },
        }),
      );

      const route = response.data?.routes?.[0];
      if (!route) {
        this.logger.warn(`OSRM: aucune route trouvée pour ${originLat},${originLon} → ${destLat},${destLon}`);
        return null;
      }

      return {
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration,
      };
    } catch (error: any) {
      this.logger.error(`OSRM API error: ${error.message}`);
      return null;
    }
  }
}
