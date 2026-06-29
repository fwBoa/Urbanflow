import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { ConfigService } from '@nestjs/config';

/**
 * Véhicules partagés (trottinettes/vélos en free-floating) via le standard GBFS.
 *
 * Contexte réglementaire : Paris a interdit les trottinettes free-floating en
 * août 2023. Les opérateurs (Lime, Dott, Voi) ont retiré leurs flottes parisiennes,
 * donc leurs flux GBFS renvoient une liste vide ou 404 pour Paris. Le service
 * gère ces cas gracieusement (liste vide + message explicatif) plutôt que de
 * planter l'API. Pour une ville qui autorise le free-floating, il suffit de
 * configurer `GBFS_FEEDS` (URLs des gbfs.json des opérateurs) pour obtenir des
 * véhicules réels.
 *
 * GBFS 2.x : gbfs.json → data[<lang>].feeds → free_bike_status.json → data.bikes
 * GBFS 3.x : vehicle_status.json → data.vehicles
 */
export interface NearbyVehicle {
  id: string;
  operator: string;
  type: 'trottinette' | 'bike';
  position: { lat: number; lon: number };
  battery?: number;
  available: boolean;
  distance: number; // mètres
}

export interface NearbyVehiclesResponse {
  vehicles: NearbyVehicle[];
  total: number;
  source: string;
  message?: string;
}

@Injectable()
export class GbfsService {
  private readonly logger = new Logger(GbfsService.name);
  private readonly feeds: string[];
  /** Timeout court : ne pas bloquer la réponse si un opérateur est injoignable. */
  private readonly FETCH_TIMEOUT_MS = 3500;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // GBFS_FEEDS = URLs de discovery (gbfs.json) séparées par des virgules.
    // Désactivé par défaut (vide) car Paris interdit le free-floating ;
    // l'opérateur de déploiement le renseigne pour une ville qui l'autorise.
    const raw = this.configService.get<string>('GBFS_FEEDS') || '';
    this.feeds = raw
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
  }

  /**
   * Récupère les véhicules partagés proches d'un point.
   * Échec d'un opérateur → ignoré (liste partielle) ; tout échec → liste vide.
   */
  async getSharedVehicles(
    lat: number,
    lon: number,
    radiusKm = 2,
    limit = 20,
  ): Promise<NearbyVehiclesResponse> {
    const radiusMeters = radiusKm * 1000;

    // Pas d'opérateur configuré → on renvoie le message réglementaire (Paris).
    if (this.feeds.length === 0) {
      return {
        vehicles: [],
        total: 0,
        source: 'GBFS',
        message: this.parisOrGenericMessage(lat, lon),
      };
    }

    const all: NearbyVehicle[] = [];
    for (const discoveryUrl of this.feeds) {
      try {
        const vehicles = await this.fetchOperatorVehicles(discoveryUrl);
        for (const v of vehicles) {
          const dist = this.haversine(lat, lon, v.position.lat, v.position.lon);
          if (dist <= radiusMeters && v.available) {
            all.push({ ...v, distance: Math.round(dist) });
          }
        }
      } catch (error) {
        // Un opérateur down ne doit pas casser toute la réponse.
        this.logger.warn(
          `GBFS ${discoveryUrl} injoignable : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    all.sort((a, b) => a.distance - b.distance);
    const vehicles = all.slice(0, limit);

    if (vehicles.length === 0) {
      return {
        vehicles: [],
        total: 0,
        source: 'GBFS',
        message: this.parisOrGenericMessage(lat, lon),
      };
    }

    return { vehicles, total: vehicles.length, source: 'GBFS' };
  }

  /** Lit la discovery gbfs.json puis le flux free_bike_status/vehicle_status. */
  private async fetchOperatorVehicles(
    discoveryUrl: string,
  ): Promise<Omit<NearbyVehicle, 'distance'>[]> {
    const operator = this.guessOperator(discoveryUrl);
    const discovery = await this.getJson<{ data: any; gbfs_version?: string }>(discoveryUrl);
    if (!discovery?.data) return [];

    // GBFS 2.x : data[lang].feeds ; GBFS 1.x : data.feeds
    const langData = discovery.data.feeds ? discovery.data : Object.values(discovery.data)[0] as any;
    const feeds: Array<{ name: string; url: string }> = langData?.feeds || [];
    const statusFeed = feeds.find(
      (f) => f.name === 'free_bike_status' || f.name === 'vehicle_status',
    );
    if (!statusFeed) return [];

    const status = await this.getJson<{ data: any }>(statusFeed.url);
    if (!status?.data) return [];

    // 2.x : data.bikes ; 3.x : data.vehicles
    const list: any[] = status.data.bikes || status.data.vehicles || [];
    return list
      .filter((v) => typeof v.lat === 'number' && typeof v.lon === 'number')
      .filter((v) => !v.is_disabled && !v.is_reserved)
      .map((v) => ({
        id: String(v.bike_id || v.vehicle_id || v.id),
        operator,
        type: this.classifyType(v, operator),
        position: { lat: v.lat, lon: v.lon },
        battery: typeof v.current_range_miles === 'number'
          ? Math.round((v.current_range_miles / v.max_range_miles) * 100)
          : v.battery_percent,
        available: !v.is_disabled && !v.is_reserved,
      }));
  }

  /** GET JSON avec timeout court et échec non fatal. */
  private async getJson<T>(url: string): Promise<T | null> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<T>(url).pipe(
          timeout(this.FETCH_TIMEOUT_MS),
          catchError(() => of(null)),
        ),
      );
      return res?.data ?? null;
    } catch {
      return null;
    }
  }

  private classifyType(vehicle: any, operator: string): 'trottinette' | 'bike' {
    const vt = (vehicle.vehicle_type_id || vehicle.form_factor || '').toString().toLowerCase();
    if (vt.includes('scooter') || vt.includes('trottinette') || vt.includes('kick')) {
      return 'trottinette';
    }
    if (vt.includes('bike') || vt.includes('velo') || vt.includes('bicycle')) {
      return 'bike';
    }
    // Dott/Voi = trottinettes par défaut ; Lime = mixte, on suppose trottinette
    // (les vélos Lime sont rares en France free-floating).
    return operator === 'lime' ? 'bike' : 'trottinette';
  }

  private guessOperator(url: string): string {
    const host = url.toLowerCase();
    if (host.includes('lime')) return 'lime';
    if (host.includes('dott')) return 'dott';
    if (host.includes('voi')) return 'voi';
    return new URL(url).hostname.replace(/^api\.|gbfs\./, '').split('.')[0] || 'operator';
  }

  /** Message adapté : Paris → mention de l'interdiction 2023, sinon générique. */
  private parisOrGenericMessage(lat: number, lon: number): string {
    // Bounding-box Paris intra-muros (approximative)
    const inParis = lat > 48.80 && lat < 48.91 && lon > 2.21 && lon < 2.48;
    if (inParis) {
      return 'Aucun opérateur actif — free-floating interdit à Paris en 2023.';
    }
    return 'Aucun véhicule partagé trouvé à proximité (configurez GBFS_FEEDS pour votre ville).';
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}