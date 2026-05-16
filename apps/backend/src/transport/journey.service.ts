import { Injectable, Logger } from '@nestjs/common';
import { GtfsParserService, GtfsIndex, GtfsStop, GtfsStopTime, GtfsTrip, GtfsRoute } from './gtfs-parser.service';
import { CarbonService } from './carbon.service';

/**
 * Types pour le calcul d'itinéraires
 */
export interface JourneyQuery {
  /** Point de départ (lat, lon) */
  origin: { lat: number; lon: number };
  /** Point d'arrivée (lat, lon) */
  destination: { lat: number; lon: number };
  /** Date et heure de départ (ISO string) */
  departureTime?: string;
  /** Date et heure d'arrivée souhaitée (ISO string) */
  arrivalTime?: string;
  /** Modes de transport autorisés */
  modes?: TransportMode[];
  /** Accessibilité fauteuil roulant */
  wheelchairAccessible?: boolean;
  /** Nombre maximum de correspondances */
  maxTransfers?: number;
}

export type TransportMode =
  | 'metro'
  | 'rer'
  | 'transilien'
  | 'tram'
  | 'bus'
  | 'velib'
  | 'marche';

export interface JourneyResult {
  /** Durée totale en minutes */
  durationMinutes: number;
  /** Nombre de correspondances */
  transfers: number;
  /** Distance totale estimée en km */
  distanceKm: number;
  /** Empreinte carbone totale en gCO2 */
  co2Ggrams: number;
  /** Étapes du trajet */
  segments: JourneySegment[];
  /** Heure de départ */
  departureTime: string;
  /** Heure d'arrivée */
  arrivalTime: string;
}

export interface JourneySegment {
  type: 'walking' | 'transit' | 'velib';
  mode?: string;
  /** Ligne (ex: "M1", "RER A", "Bus 42") */
  lineName?: string;
  lineColor?: string;
  /** Arrêt de départ */
  fromStop?: string;
  /** Arrêt d'arrivée */
  toStop?: string;
  /** Durée en minutes */
  durationMinutes: number;
  /** Distance en km */
  distanceKm: number;
  /** Nombre de stations/arrêts traversés */
  numStops?: number;
  /** Heure de départ du segment */
  departureTime?: string;
  /** Heure d'arrivée du segment */
  arrivalTime?: string;
  /** Empreinte CO2 du segment */
  co2Ggrams: number;
  /** Instructions textuelles */
  instruction: string;
}

/**
 * Service de calcul d'itinéraires
 *
 * Implémente un algorithme inspiré de RAPTOR (Round-Based Public
 * Transit Routing) pour calculer des itinéraires multimodaux
 * à partir des données GTFS parsées.
 *
 * Phases d'implémentation :
 * - Phase 1 (actuelle) : Recherche basique par arrêt le plus proche
 *   + parcours des courses disponibles
 * - Phase 2 : Algorithme RAPTOR complet avec profil de recherche
 * - Phase 3 : Optimisation avec contraction de graphe
 */
@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  /** Vitesse de marche : 4 km/h */
  private readonly WALK_SPEED_KMH = 4;
  /** Vitesse vélo : 15 km/h */
  private readonly BIKE_SPEED_KMH = 15;
  /** Rayon de marche max autour d'un arrêt : 500m */
  private readonly WALK_RADIUS_KM = 0.5;
  /** Rayon vélib max : 1km */
  private readonly VELIB_RADIUS_KM = 1.0;

  constructor(
    private readonly gtfsParser: GtfsParserService,
    private readonly carbonService: CarbonService,
  ) {}

  /**
   * Calcule un itinéraire entre deux points
   *
   * Algorithme simplifié (Phase 1) :
   * 1. Trouver les arrêts proches de l'origine et de la destination
   * 2. Chercher des courses directes entre ces arrêts
   * 3. Si pas de course directe, chercher avec 1 correspondance
   * 4. Ajouter les segments de marche aux extrémités
   * 5. Calculer l'empreinte carbone de chaque segment
   */
  async findJourney(query: JourneyQuery): Promise<JourneyResult[]> {
    if (!this.gtfsParser.isLoaded()) {
      this.logger.warn('GTFS data not loaded, cannot calculate journey');
      return [];
    }

    const maxTransfers = query.maxTransfers ?? 2;
    const departureTime = query.departureTime
      ? new Date(query.departureTime)
      : new Date();

    // 1. Trouver les arrêts proches de l'origine et destination
    const originStops = this.gtfsParser.findStopsNearby(
      query.origin.lat,
      query.origin.lon,
      this.WALK_RADIUS_KM,
    );
    const destStops = this.gtfsParser.findStopsNearby(
      query.destination.lat,
      query.destination.lon,
      this.WALK_RADIUS_KM,
    );

    if (originStops.length === 0 || destStops.length === 0) {
      // Pas d'arrêts à proximité → trajet à pied ou vélib uniquement
      return this.computeNonTransitJourney(query);
    }

    const journeys: JourneyResult[] = [];
    const timeStr = this.formatTime(departureTime);

    // 2. Chercher des courses directes (0 correspondance)
    for (const originStop of originStops.slice(0, 5)) {
      for (const destStop of destStops.slice(0, 5)) {
        if (originStop.stop_id === destStop.stop_id) continue;

        const directJourney = this.findDirectJourney(
          originStop,
          destStop,
          timeStr,
          query,
        );
        if (directJourney) {
          journeys.push(directJourney);
        }
      }
    }

    // 3. Chercher avec 1 correspondance si demandé
    if (maxTransfers >= 1 && journeys.length < 3) {
      const oneTransferJourneys = this.findOneTransferJourney(
        originStops.slice(0, 5),
        destStops.slice(0, 5),
        timeStr,
        query,
      );
      journeys.push(...oneTransferJourneys);
    }

    // 4. Trier par durée et dédupliquer
    const uniqueJourneys = this.deduplicateJourneys(journeys);
    uniqueJourneys.sort((a, b) => a.durationMinutes - b.durationMinutes);

    return uniqueJourneys.slice(0, 5); // Top 5 itinéraires
  }

  /**
   * Cherche un trajet direct entre deux arrêts
   */
  private findDirectJourney(
    originStop: GtfsStop,
    destStop: GtfsStop,
    departureTime: string,
    query: JourneyQuery,
  ): JourneyResult | null {
    const departures = this.gtfsParser.getNextDepartures(
      originStop.stop_id,
      departureTime,
      20,
    );

    for (const dep of departures) {
      // Vérifier si cette course passe aussi par l'arrêt de destination
      const tripStopTimes = this.gtfsParser.getIndex()?.stopTimesByTrip.get(dep.trip.trip_id) || [];
      const originSeq = tripStopTimes.find((st) => st.stop_id === originStop.stop_id);
      const destSeq = tripStopTimes.find((st) => st.stop_id === destStop.stop_id);

      if (originSeq && destSeq && destSeq.stop_sequence > originSeq.stop_sequence) {
        // Course directe trouvée !
        const walkOrigin = this.walkSegment(
          query.origin.lat,
          query.origin.lon,
          originStop.stop_lat,
          originStop.stop_lon,
          originStop.stop_name,
        );
        const walkDest = this.walkSegment(
          destStop.stop_lat,
          destStop.stop_lon,
          query.destination.lat,
          query.destination.lon,
          destStop.stop_name,
        );

        const transitDuration = this.timeDiffMinutes(
          originSeq.departure_time,
          destSeq.arrival_time,
        );

        const transitDistance = this.estimateTransitDistance(
          tripStopTimes,
          originSeq.stop_sequence,
          destSeq.stop_sequence,
        );

        const modeName = this.getModeName(dep.route.route_type);
        const co2 = this.carbonService.calculateFromGtfsRouteType(
          dep.route.route_type,
          transitDistance,
        );

        const transitSegment: JourneySegment = {
          type: 'transit',
          mode: modeName,
          lineName: dep.route.route_short_name || dep.route.route_long_name,
          lineColor: dep.route.route_color ? `#${dep.route.route_color}` : undefined,
          fromStop: originStop.stop_name,
          toStop: destStop.stop_name,
          durationMinutes: transitDuration,
          distanceKm: transitDistance,
          numStops: destSeq.stop_sequence - originSeq.stop_sequence,
          departureTime: originSeq.departure_time,
          arrivalTime: destSeq.arrival_time,
          co2Ggrams: co2.emissionsGco2,
          instruction: `Prendre ${dep.route.route_short_name || dep.route.route_long_name} de ${originStop.stop_name} à ${destStop.stop_name}`,
        };

        const totalDuration =
          walkOrigin.durationMinutes +
          transitDuration +
          walkDest.durationMinutes;

        const totalCo2 =
          walkOrigin.co2Ggrams + co2.emissionsGco2 + walkDest.co2Ggrams;

        return {
          durationMinutes: totalDuration,
          transfers: 0,
          distanceKm:
            walkOrigin.distanceKm + transitDistance + walkDest.distanceKm,
          co2Ggrams: totalCo2,
          segments: [walkOrigin, transitSegment, walkDest],
          departureTime: originSeq.departure_time,
          arrivalTime: destSeq.arrival_time,
        };
      }
    }

    return null;
  }

  /**
   * Cherche un trajet avec 1 correspondance
   */
  private findOneTransferJourney(
    originStops: GtfsStop[],
    destStops: GtfsStop[],
    departureTime: string,
    query: JourneyQuery,
  ): JourneyResult[] {
    const results: JourneyResult[] = [];
    const index = this.gtfsParser.getIndex();
    if (!index) return results;

    const destStopIds = new Set(destStops.map((s) => s.stop_id));

    for (const originStop of originStops) {
      const departures = this.gtfsParser.getNextDepartures(
        originStop.stop_id,
        departureTime,
        10,
      );

      for (const dep of departures) {
        const tripStopTimes = index.stopTimesByTrip.get(dep.trip.trip_id) || [];
        const originSeq = tripStopTimes.find(
          (st) => st.stop_id === originStop.stop_id,
        );

        if (!originSeq) continue;

        // Parcourir les arrêts suivants de cette course
        for (const st of tripStopTimes) {
          if (st.stop_sequence <= originSeq.stop_sequence) continue;

          // Cet arrêt est-il une correspondance possible ?
          const transferStop = index.stopsById.get(st.stop_id);
          if (!transferStop) continue;

          // Vérifier s'il y a une course de cet arrêt vers la destination
          const transferDepartures = this.gtfsParser.getNextDepartures(
            st.stop_id,
            st.arrival_time,
            10,
          );

          for (const dep2 of transferDepartures) {
            const trip2StopTimes = index.stopTimesByTrip.get(dep2.trip.trip_id) || [];
            const transferSeq = trip2StopTimes.find(
              (st2) => st2.stop_id === st.stop_id,
            );

            for (const destStop of destStops) {
              const destSeq = trip2StopTimes.find(
                (st2) => st2.stop_id === destStop.stop_id,
              );

              if (
                transferSeq &&
                destSeq &&
                destSeq.stop_sequence > transferSeq.stop_sequence &&
                dep.trip.trip_id !== dep2.trip.trip_id
              ) {
                // Trajet avec 1 correspondance trouvé !
                const journey = this.buildTwoSegmentJourney(
                  query,
                  originStop,
                  transferStop,
                  destStop,
                  dep,
                  dep2,
                  originSeq,
                  st,
                  transferSeq,
                  destSeq,
                  tripStopTimes,
                  trip2StopTimes,
                );
                if (journey) results.push(journey);
              }
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Construit un trajet à 2 segments (1 correspondance)
   */
  private buildTwoSegmentJourney(
    query: JourneyQuery,
    originStop: GtfsStop,
    transferStop: GtfsStop,
    destStop: GtfsStop,
    dep1: { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime },
    dep2: { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime },
    originSeq: GtfsStopTime,
    transferArrival: GtfsStopTime,
    transferDeparture: GtfsStopTime,
    destSeq: GtfsStopTime,
    trip1StopTimes: GtfsStopTime[],
    trip2StopTimes: GtfsStopTime[],
  ): JourneyResult | null {
    const walkOrigin = this.walkSegment(
      query.origin.lat,
      query.origin.lon,
      originStop.stop_lat,
      originStop.stop_lon,
      originStop.stop_name,
    );
    const walkDest = this.walkSegment(
      destStop.stop_lat,
      destStop.stop_lon,
      query.destination.lat,
      query.destination.lon,
      destStop.stop_name,
    );

    const transit1Duration = this.timeDiffMinutes(
      originSeq.departure_time,
      transferArrival.arrival_time,
    );
    const transit2Duration = this.timeDiffMinutes(
      transferDeparture.departure_time,
      destSeq.arrival_time,
    );
    const waitTime = this.timeDiffMinutes(
      transferArrival.arrival_time,
      transferDeparture.departure_time,
    );

    const transit1Dist = this.estimateTransitDistance(
      trip1StopTimes,
      originSeq.stop_sequence,
      transferArrival.stop_sequence,
    );
    const transit2Dist = this.estimateTransitDistance(
      trip2StopTimes,
      transferDeparture.stop_sequence,
      destSeq.stop_sequence,
    );

    const co2_1 = this.carbonService.calculateFromGtfsRouteType(
      dep1.route.route_type,
      transit1Dist,
    );
    const co2_2 = this.carbonService.calculateFromGtfsRouteType(
      dep2.route.route_type,
      transit2Dist,
    );

    const segment1: JourneySegment = {
      type: 'transit',
      mode: this.getModeName(dep1.route.route_type),
      lineName: dep1.route.route_short_name || dep1.route.route_long_name,
      lineColor: dep1.route.route_color ? `#${dep1.route.route_color}` : undefined,
      fromStop: originStop.stop_name,
      toStop: transferStop.stop_name,
      durationMinutes: transit1Duration,
      distanceKm: transit1Dist,
      numStops: transferArrival.stop_sequence - originSeq.stop_sequence,
      departureTime: originSeq.departure_time,
      arrivalTime: transferArrival.arrival_time,
      co2Ggrams: co2_1.emissionsGco2,
      instruction: `Prendre ${dep1.route.route_short_name || dep1.route.route_long_name} de ${originStop.stop_name} à ${transferStop.stop_name}`,
    };

    const segment2: JourneySegment = {
      type: 'transit',
      mode: this.getModeName(dep2.route.route_type),
      lineName: dep2.route.route_short_name || dep2.route.route_long_name,
      lineColor: dep2.route.route_color ? `#${dep2.route.route_color}` : undefined,
      fromStop: transferStop.stop_name,
      toStop: destStop.stop_name,
      durationMinutes: transit2Duration,
      distanceKm: transit2Dist,
      numStops: destSeq.stop_sequence - transferDeparture.stop_sequence,
      departureTime: transferDeparture.departure_time,
      arrivalTime: destSeq.arrival_time,
      co2Ggrams: co2_2.emissionsGco2,
      instruction: `Correspondance — Prendre ${dep2.route.route_short_name || dep2.route.route_long_name} de ${transferStop.stop_name} à ${destStop.stop_name}`,
    };

    const totalDuration =
      walkOrigin.durationMinutes +
      transit1Duration +
      waitTime +
      transit2Duration +
      walkDest.durationMinutes;

    const totalCo2 =
      walkOrigin.co2Ggrams +
      co2_1.emissionsGco2 +
      co2_2.emissionsGco2 +
      walkDest.co2Ggrams;

    return {
      durationMinutes: totalDuration,
      transfers: 1,
      distanceKm:
        walkOrigin.distanceKm + transit1Dist + transit2Dist + walkDest.distanceKm,
      co2Ggrams: totalCo2,
      segments: [walkOrigin, segment1, segment2, walkDest],
      departureTime: originSeq.departure_time,
      arrivalTime: destSeq.arrival_time,
    };
  }

  /**
   * Calcule un trajet sans transport en commun (marche / vélib)
   */
  private computeNonTransitJourney(query: JourneyQuery): JourneyResult[] {
    const directDistance = this.haversineKm(
      query.origin.lat,
      query.origin.lon,
      query.destination.lat,
      query.destination.lon,
    );

    // Marche
    const walkDuration = Math.round((directDistance / this.WALK_SPEED_KMH) * 60);
    const walkJourney: JourneyResult = {
      durationMinutes: walkDuration,
      transfers: 0,
      distanceKm: directDistance,
      co2Ggrams: 0,
      segments: [
        {
          type: 'walking',
          mode: 'marche',
          durationMinutes: walkDuration,
          distanceKm: directDistance,
          co2Ggrams: 0,
          instruction: `Marcher jusqu'à destination (${directDistance.toFixed(1)} km)`,
        },
      ],
      departureTime: new Date().toISOString(),
      arrivalTime: new Date(Date.now() + walkDuration * 60000).toISOString(),
    };

    // Vélib (si distance > 1km)
    if (directDistance > 1) {
      const bikeDuration = Math.round((directDistance / this.BIKE_SPEED_KMH) * 60);
      const bikeCo2 = this.carbonService.calculateEmissions('velib_electrique', directDistance);

      const bikeJourney: JourneyResult = {
        durationMinutes: bikeDuration,
        transfers: 0,
        distanceKm: directDistance,
        co2Ggrams: bikeCo2.emissionsGco2,
        segments: [
          {
            type: 'velib',
            mode: 'velib_electrique',
            durationMinutes: bikeDuration,
            distanceKm: directDistance,
            co2Ggrams: bikeCo2.emissionsGco2,
            instruction: `Prendre un Vélib' jusqu'à destination (${directDistance.toFixed(1)} km)`,
          },
        ],
        departureTime: new Date().toISOString(),
        arrivalTime: new Date(Date.now() + bikeDuration * 60000).toISOString(),
      };

      return [walkJourney, bikeJourney];
    }

    return [walkJourney];
  }

  // ─── Utilitaires ─────────────────────────────────────────────────────

  private walkSegment(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
    stopName: string,
  ): JourneySegment {
    const distanceKm = this.haversineKm(fromLat, fromLon, toLat, toLon);
    const durationMinutes = Math.round((distanceKm / this.WALK_SPEED_KMH) * 60);

    return {
      type: 'walking',
      mode: 'marche',
      fromStop: distanceKm > 0.01 ? 'Votre position' : stopName,
      toStop: stopName,
      durationMinutes,
      distanceKm: Math.round(distanceKm * 100) / 100,
      co2Ggrams: 0,
      instruction: `Marcher jusqu'à ${stopName} (${(distanceKm * 1000).toFixed(0)}m)`,
    };
  }

  private getModeName(routeType: number): string {
    const modes: Record<number, string> = {
      0: 'Tramway',
      1: 'Métro',
      2: 'RER/Train',
      3: 'Bus',
      4: 'Navette fluviale',
      5: 'Trolleybus',
      6: 'Téléphérique',
      7: 'Funiculaire',
    };
    return modes[routeType] || 'Transport';
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private formatTime(date: Date): string {
    return date.toTimeString().slice(0, 8); // HH:MM:SS
  }

  private timeDiffMinutes(time1: string, time2: string): number {
    const s1 = this.timeToSeconds(time1);
    const s2 = this.timeToSeconds(time2);
    return Math.max(0, Math.round((s2 - s1) / 60));
  }

  private timeToSeconds(time: string): number {
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }

  /**
   * Estime la distance d'un segment de trajet en transport
   * en sommant les distances entre arrêts consécutifs
   */
  private estimateTransitDistance(
    stopTimes: GtfsStopTime[],
    fromSequence: number,
    toSequence: number,
  ): number {
    let totalDistance = 0;
    const index = this.gtfsParser.getIndex();
    if (!index) return 0;

    for (let i = fromSequence; i < toSequence; i++) {
      const st1 = stopTimes.find((st) => st.stop_sequence === i);
      const st2 = stopTimes.find((st) => st.stop_sequence === i + 1);
      if (st1 && st2) {
        const stop1 = index.stopsById.get(st1.stop_id);
        const stop2 = index.stopsById.get(st2.stop_id);
        if (stop1 && stop2) {
          totalDistance += this.haversineKm(
            stop1.stop_lat,
            stop1.stop_lon,
            stop2.stop_lat,
            stop2.stop_lon,
          );
        }
      }
    }

    // Facteur de correction : distance à vol d'oiseau ≈ 60-70% de la distance réelle
    return Math.round(totalDistance * 1.4 * 100) / 100;
  }

  private deduplicateJourneys(journeys: JourneyResult[]): JourneyResult[] {
    const seen = new Set<string>();
    return journeys.filter((j) => {
      const key = j.segments
        .filter((s) => s.type === 'transit')
        .map((s) => `${s.lineName}:${s.fromStop}:${s.toStop}`)
        .join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}