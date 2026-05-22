import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * GBFS (General Bikeshare Feed Specification) Service
 *
 * Intègre les flux GBFS des opérateurs de mobilité partagée :
 * - Lime Paris : trottinettes électriques + vélos électriques
 * - Dott Paris : vélos électriques (et trottinettes si disponibles)
 * - Voi Paris : trottinettes électriques
 * - Vélib' Métropole : vélos classiques + électriques
 *
 * GBFS v2.x / v3.0 standard : https://gbfs.org/specification/
 */

export interface GbfsVehicle {
  id: string;
  type: 'scooter' | 'ebike' | 'bike' | 'velib';
  operator: string;
  lat: number;
  lon: number;
  rangeMeters: number;
  batteryPercent: number;
  isAvailable: boolean;
  lastReported: number;
}

export interface GbfsStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  operator: string;
  capacity: number;
  availableVehicles: number;
  availableDocks: number;
  isVirtual: boolean;
}

interface GbfsProvider {
  id: string;
  name: string;
  gbfsUrl: string;
  vehicleTypes: string[]; // filter: scooter, bicycle, etc.
}

@Injectable()
export class GbfsService {
  private readonly logger = new Logger(GbfsService.name);

  /** Cache des véhicules libres par opérateur */
  private vehiclesCache = new Map<string, GbfsVehicle[]>();
  /** Cache des stations par opérateur */
  private stationsCache = new Map<string, GbfsStation[]>();
  /** Timestamp du dernier rafraîchissement */
  private lastRefresh = new Map<string, number>();
  /** Durée de validité du cache (5 minutes) */
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  private readonly providers: GbfsProvider[] = [
    {
      id: 'lime',
      name: 'Lime',
      gbfsUrl: 'https://data.lime.bike/api/partners/v2/gbfs/paris/gbfs.json',
      vehicleTypes: ['scooter', 'bicycle'],
    },
    {
      id: 'dott',
      name: 'Dott',
      gbfsUrl: 'https://gbfs.api.ridedott.com/public/v2/paris/gbfs.json',
      vehicleTypes: ['bicycle'],
    },
    {
      id: 'voi',
      name: 'Voi',
      gbfsUrl: 'https://api.voiapp.io/gbfs/fr/6bb6b5dc-1cda-4da7-9216-d3023a0bc54a/v2/352/gbfs.json',
      vehicleTypes: ['scooter'],
    },
  ];

  constructor(private readonly httpService: HttpService) {}

  /**
   * Récupère les véhicules libres (trottinettes + vélos) à proximité d'un point
   */
  async getNearbyVehicles(
    lat: number,
    lon: number,
    radiusKm = 1,
    type?: 'scooter' | 'ebike' | 'bike' | 'all',
  ): Promise<GbfsVehicle[]> {
    await this.refreshAllIfNeeded();

    const allVehicles: GbfsVehicle[] = [];
    for (const vehicles of this.vehiclesCache.values()) {
      allVehicles.push(...vehicles);
    }

    // Filter by type
    let filtered = allVehicles;
    if (type && type !== 'all') {
      filtered = allVehicles.filter((v) => {
        if (type === 'scooter') return v.type === 'scooter';
        if (type === 'ebike') return v.type === 'ebike' || v.type === 'velib';
        if (type === 'bike') return v.type === 'bike' || v.type === 'velib';
        return true;
      });
    }

    // Filter by distance
    const radiusMeters = radiusKm * 1000;
    const nearby = filtered
      .map((v) => ({
        ...v,
        distance: this.haversineDistance(lat, lon, v.lat, v.lon),
      }))
      .filter((v) => v.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 50);

    return nearby;
  }

  /**
   * Récupère les stations (Vélib' + stations virtuelles) à proximité
   */
  async getNearbyStations(
    lat: number,
    lon: number,
    radiusKm = 1,
  ): Promise<GbfsStation[]> {
    await this.refreshAllIfNeeded();

    const allStations: GbfsStation[] = [];
    for (const stations of this.stationsCache.values()) {
      allStations.push(...stations);
    }

    const radiusMeters = radiusKm * 1000;
    return allStations
      .map((s) => ({
        ...s,
        // distance calculated inline
      }))
      .filter((s) => this.haversineDistance(lat, lon, s.lat, s.lon) <= radiusMeters)
      .sort((a, b) => this.haversineDistance(lat, lon, a.lat, a.lon) - this.haversineDistance(lat, lon, b.lat, b.lon))
      .slice(0, 30);
  }

  /**
   * Statut des flux GBFS (pour le endpoint /api/transport/gbfs-status)
   */
  getStatus(): Record<string, { operator: string; vehicles: number; stations: number; lastRefresh: string }> {
    const status: Record<string, { operator: string; vehicles: number; stations: number; lastRefresh: string }> = {};
    for (const provider of this.providers) {
      const vehicles = this.vehiclesCache.get(provider.id) || [];
      const stations = this.stationsCache.get(provider.id) || [];
      const lastRefreshTime = this.lastRefresh.get(provider.id);
      status[provider.id] = {
        operator: provider.name,
        vehicles: vehicles.length,
        stations: stations.length,
        lastRefresh: lastRefreshTime ? new Date(lastRefreshTime).toISOString() : 'never',
      };
    }
    return status;
  }

  /**
   * Refresh all providers if cache is stale
   */
  private async refreshAllIfNeeded(): Promise<void> {
    const now = Date.now();
    for (const provider of this.providers) {
      const lastRefresh = this.lastRefresh.get(provider.id) || 0;
      if (now - lastRefresh > this.CACHE_TTL_MS) {
        await this.refreshProvider(provider).catch(() => {
          // Silently fail — cached data will be used
        });
      }
    }
  }

  /**
   * Refresh a single provider's data from GBFS feeds
   */
  private async refreshProvider(provider: GbfsProvider): Promise<void> {
    try {
      // 1. Get the GBFS discovery document
      const gbfsResponse = await firstValueFrom(
        this.httpService.get(provider.gbfsUrl, { timeout: 10000 }),
      );
      const gbfsData = gbfsResponse.data;
      const feeds = gbfsData?.data?.en?.feeds || gbfsData?.data?.fr?.feeds || [];

      // Build feed URL map
      const feedUrls: Record<string, string> = {};
      for (const feed of feeds) {
        feedUrls[feed.name] = feed.url;
      }

      // 2. Fetch vehicle types (to classify scooter vs bike)
      const vehicleTypes = new Map<string, { formFactor: string; propulsionType: string }>();
      if (feedUrls['vehicle_types']) {
        try {
          const vtResponse = await firstValueFrom(
            this.httpService.get(feedUrls['vehicle_types'], { timeout: 10000 }),
          );
          const vtData = vtResponse.data?.data?.vehicle_types || [];
          for (const vt of vtData) {
            vehicleTypes.set(vt.vehicle_type_id, {
              formFactor: vt.form_factor,
              propulsionType: vt.propulsion_type,
            });
          }
        } catch {
          // Vehicle types not available — will classify as 'bike'
        }
      }

      // 3. Fetch free-floating vehicles
      const vehicles: GbfsVehicle[] = [];
      if (feedUrls['free_bike_status']) {
        try {
          const bikesResponse = await firstValueFrom(
            this.httpService.get(feedUrls['free_bike_status'], { timeout: 15000 }),
          );
          const bikes = bikesResponse.data?.data?.bikes || [];

          for (const bike of bikes) {
            if (bike.is_disabled || bike.is_reserved) continue;
            if (!bike.lat || !bike.lon) continue;

            const vt = vehicleTypes.get(bike.vehicle_type_id);
            let type: GbfsVehicle['type'] = 'bike';
            if (vt?.formFactor === 'scooter') {
              type = 'scooter';
            } else if (vt?.propulsionType === 'electric' || vt?.propulsionType === 'electric_assist') {
              type = 'ebike';
            } else if (bike.vehicle_type === 'e-bike') {
              type = 'ebike';
            }

            // Fallback: check rental_uris for scooter hints (Voi lists scooters as "voi_bike")
            if (type === 'bike' || type === 'ebike') {
              const rentalUris = bike.rental_uris;
              if (rentalUris) {
                const uriStr = JSON.stringify(rentalUris).toLowerCase();
                if (uriStr.includes('scooter')) {
                  type = 'scooter';
                }
              }
            }

            // Fallback: check vehicle_type_id for scooter keywords
            if (type === 'bike' && bike.vehicle_type_id) {
              const vtid = String(bike.vehicle_type_id).toLowerCase();
              if (vtid.includes('scooter') || vtid.includes('trottinette')) {
                type = 'scooter';
              } else if (vtid.includes('ebike') || vtid.includes('e-bike') || vtid.includes('electric')) {
                type = 'ebike';
              }
            }

            vehicles.push({
              id: bike.bike_id,
              type,
              operator: provider.name,
              lat: bike.lat,
              lon: bike.lon,
              rangeMeters: bike.current_range_meters || 0,
              batteryPercent: bike.current_fuel_percent
                ? Math.round(bike.current_fuel_percent * 100)
                : 0,
              isAvailable: !bike.is_disabled && !bike.is_reserved,
              lastReported: bike.last_reported || Date.now() / 1000,
            });
          }
        } catch (e) {
          this.logger.warn(`Failed to fetch free_bike_status for ${provider.name}`);
        }
      }

      // 4. Fetch stations
      const stations: GbfsStation[] = [];
      if (feedUrls['station_information'] && feedUrls['station_status']) {
        try {
          const [stationInfoRes, stationStatusRes] = await Promise.all([
            firstValueFrom(this.httpService.get(feedUrls['station_information'], { timeout: 10000 })),
            firstValueFrom(this.httpService.get(feedUrls['station_status'], { timeout: 10000 })),
          ]);

          const stationInfoMap = new Map<string, any>();
          for (const s of stationInfoRes.data?.data?.stations || []) {
            stationInfoMap.set(s.station_id, s);
          }

          for (const status of stationStatusRes.data?.data?.stations || []) {
            const info = stationInfoMap.get(status.station_id);
            if (!info) continue;

            stations.push({
              id: status.station_id,
              name: info.name || `Station ${provider.name}`,
              lat: info.lat,
              lon: info.lon,
              operator: provider.name,
              capacity: info.capacity || 0,
              availableVehicles: status.num_bikes_available || 0,
              availableDocks: status.num_docks_available || 0,
              isVirtual: info.is_virtual_station || false,
            });
          }
        } catch {
          this.logger.warn(`Failed to fetch stations for ${provider.name}`);
        }
      }

      this.vehiclesCache.set(provider.id, vehicles);
      this.stationsCache.set(provider.id, stations);
      this.lastRefresh.set(provider.id, Date.now());

      this.logger.log(
        `${provider.name}: ${vehicles.length} vehicles, ${stations.length} stations loaded`,
      );
    } catch (e) {
      this.logger.warn(`Failed to refresh GBFS provider ${provider.name}: ${e.message}`);
    }
  }

  /**
   * Cron job: refresh all GBFS data every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCronRefresh() {
    this.logger.debug('Refreshing GBFS data (cron)...');
    for (const provider of this.providers) {
      await this.refreshProvider(provider).catch(() => {});
    }
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}