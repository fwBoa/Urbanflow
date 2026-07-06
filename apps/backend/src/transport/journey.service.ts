import { Injectable, Logger } from '@nestjs/common';
import {
  GtfsParserService,
  GtfsStop,
  GtfsStopTime,
  GtfsTrip,
  GtfsRoute,
} from './gtfs-parser.service';
import { CarbonService } from './carbon.service';
import { PrimService } from './prim.service';

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

export interface JourneyAlert {
  id: string;
  headerText: string;
  descriptionText?: string;
  severity: 'info' | 'warning' | 'severe' | 'unknown';
  affectedRoutes: string[];
}

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
  /** Indique si l'itinéraire est un fallback (données GTFS non disponibles) */
  isFallback?: boolean;
  /** Alertes temps réel affectant les lignes de ce trajet */
  alerts?: JourneyAlert[];
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
  /** Shape ID pour trajectoire réelle (lazy load) */
  shapeId?: string;
  /** Instructions textuelles */
  instruction: string;
  /** Direction / terminus */
  direction?: string;
  /** Quai / voie */
  platform?: string;
  /** Destination affichée sur le véhicule */
  headsign?: string;
  /** Temps d'attente estimé en minutes */
  waitTimeMinutes?: number;
  /**
   * Géométrie réelle du segment (paires [lon, lat]) — embarquée par Navitia
   * dans chaque section (geojson LineString). Présente → la carte trace la
   * vraie trajectoire sans lazy-load /shape/:id. Absente (itinéraire GTFS) →
   * le frontend retombe sur shapeId.
   */
  geojson?: Array<[number, number]>;
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
  /** Rayon de marche max autour d'un arrêt : 500m (5 min à pied, plus réaliste) */
  private readonly WALK_RADIUS_KM = 0.5;
  /** Rayon vélib max : 1km */
  private readonly VELIB_RADIUS_KM = 1.0;

  /** Cache LRU des résultats journey — clé: hash params, TTL 120s, 500 entrées */
  private readonly journeyCache = new Map<
    string,
    { result: JourneyResult[]; expiry: number }
  >();
  private readonly CACHE_TTL_MS = 120_000;
  private readonly CACHE_MAX_SIZE = 500;

  constructor(
    private readonly gtfsParser: GtfsParserService,
    private readonly carbonService: CarbonService,
    private readonly primService: PrimService,
  ) {}

  private cacheKey(
    query: JourneyQuery,
    maxTransfers: number,
    timeStr: string,
  ): string {
    return [
      query.origin.lat.toFixed(4),
      query.origin.lon.toFixed(4),
      query.destination.lat.toFixed(4),
      query.destination.lon.toFixed(4),
      timeStr,
      maxTransfers,
      (query.modes || []).join(','),
    ].join('|');
  }

  private getCached(key: string): JourneyResult[] | null {
    const entry = this.journeyCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.journeyCache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setCached(key: string, result: JourneyResult[]): void {
    if (this.journeyCache.size >= this.CACHE_MAX_SIZE) {
      // Éviction FIFO simple
      const first = this.journeyCache.keys().next().value;
      if (first !== undefined) this.journeyCache.delete(first);
    }
    this.journeyCache.set(key, {
      result,
      expiry: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Calcule un itinéraire entre deux points
   *
   * Algorithme RAPTOR Phase 2 (Round-Based Public Transit Routing) :
   * 1. Initialize: mark origin stops, set best-known arrival times
   * 2. For each round k=1..K (K = max transfers + 1):
   *    a. For each marked stop, find routes serving it
   *    b. Traverse each route to find earlier arrivals
   *    c. Update best-known times and mark new stops
   * 3. Add foot-paths at transfers
   * 4. Include non-transit alternatives (walk, Vélib)
   */
  async findJourney(query: JourneyQuery): Promise<JourneyResult[]> {
    const maxTransfers = query.maxTransfers ?? 2;
    const departureTime = query.departureTime
      ? new Date(query.departureTime)
      : new Date();
    const timeStr = this.formatTime(departureTime);

    // ─── Cache LRU ─────────────────────────────────────────────────────
    const cacheKey = this.cacheKey(query, maxTransfers, timeStr);
    const cached = this.getCached(cacheKey);
    if (cached) {
      this.logger.debug(
        `Journey cache hit for key=${cacheKey.slice(0, 40)}...`,
      );
      return cached;
    }

    // Vérifier que l'origine et la destination sont dans la région parisienne
    const originDistFromParis = this.haversineKm(
      query.origin.lat,
      query.origin.lon,
      48.8566,
      2.3522,
    );
    const destDistFromParis = this.haversineKm(
      query.destination.lat,
      query.destination.lon,
      48.8566,
      2.3522,
    );
    if (originDistFromParis > 30 || destDistFromParis > 30) {
      this.logger.warn(
        `Journey request outside Paris region: origin=${originDistFromParis.toFixed(1)}km, dest=${destDistFromParis.toFixed(1)}km from Paris center`,
      );
      return []; // Hors scope — aucun itinéraire disponible
    }

    // Determine active service IDs for the departure day
    const activeServiceIds =
      await this.gtfsParser.getActiveServiceIds(departureTime);

    // 1. Find stops near origin and destination — en parallèle pour gagner ~30% sur I/O GTFS
    const [originStops, destStops] = await Promise.all([
      this.gtfsParser.findStopsNearby(
        query.origin.lat,
        query.origin.lon,
        this.WALK_RADIUS_KM,
        30,
      ),
      this.gtfsParser.findStopsNearby(
        query.destination.lat,
        query.destination.lon,
        this.WALK_RADIUS_KM,
        30,
      ),
    ]);

    const journeys: JourneyResult[] = [];
    const loaded = await this.gtfsParser.isLoaded();

    // 2. Use RAPTOR algorithm if GTFS data is loaded
    if (loaded && originStops.length > 0 && destStops.length > 0) {
      const raptorJourneys = await this.raptorSearch(
        originStops,
        destStops,
        timeStr,
        query,
        activeServiceIds,
        maxTransfers,
      );
      journeys.push(...raptorJourneys);
    }

    // 2b. Fallback: generate approximate transit journeys when GTFS is not available
    if (!loaded || journeys.length === 0) {
      const fallbackJourneys = await this.computeFallbackTransitJourney(query);
      journeys.push(...fallbackJourneys);
    }

    // 3. Always include non-transit alternatives (walk + Vélib)
    const nonTransitJourneys = await this.computeNonTransitJourney(query);
    journeys.push(...nonTransitJourneys);

    // 4. Filter by transport modes if specified
    const filteredJourneys = this.filterByModes(journeys, query.modes);

    // 5. Sort by duration and deduplicate
    const uniqueJourneys = this.deduplicateJourneys(filteredJourneys);
    uniqueJourneys.sort((a, b) => a.durationMinutes - b.durationMinutes);

    const final = uniqueJourneys.slice(0, 5);
    this.setCached(cacheKey, final);
    return final;
  }

  // ─── RAPTOR Phase 2 Algorithm ──────────────────────────────────────

  /**
   * RAPTOR: Round-Based Public Transit Routing
   *
   * For each round k (representing k-1 transfers):
   * - Start from stops reachable in round k-1
   * - Traverse routes from those stops
   * - Update earliest arrival times
   * - Mark stops that improved for the next round
   */
  private async raptorSearch(
    originStops: GtfsStop[],
    destStops: GtfsStop[],
    departureTime: string,
    query: JourneyQuery,
    activeServiceIds: Set<string>,
    maxTransfers: number,
  ): Promise<JourneyResult[]> {
    const destStopIds = new Set(destStops.map((s) => s.stop_id));
    const departureSeconds = this.timeToSeconds(departureTime);

    // Best-known arrival time at each stop, per round
    // key: stop_id, value: earliest arrival time in seconds since midnight
    const bestArrival = new Map<string, number>();
    // Track which route+trip brought us to each stop (for path reconstruction)
    const cameFrom = new Map<
      string,
      {
        stopId: string;
        tripId: string;
        routeId: string;
        fromStopId: string;
        arrivalTime: number;
        departureTime: number;
      }
    >();

    // Initialize: origin stops are reachable at departure time
    const markedStops = new Set<string>();
    for (const stop of originStops) {
      bestArrival.set(stop.stop_id, departureSeconds);
      markedStops.add(stop.stop_id);
    }

    const results: JourneyResult[] = [];

    // Nombre de prochains départs récupérés par arrêt (batch LATERAL + LIMIT).
    // Reprend l'overfetch historique (fetchN = max(limit*overfetch, 50) = 50) :
    // ~50 départs/arrêt couvrent toutes les routes d'un arrêt majeur sur ~1-2 h,
    // puis dédup "1er départ par route" côté Node.
    const DEPARTURE_FETCH = parseInt(
      process.env.RAPTOR_DEPARTURE_FETCH || '50',
      10,
    );
    const activeServiceArr = [...activeServiceIds];

    // RAPTOR rounds: round k means k-1 transfers
    for (let k = 0; k <= maxTransfers; k++) {
      const newMarkedStops = new Set<string>();
      if (markedStops.size === 0) break;

      const markedArr = [...markedStops];
      // Seuil per-stop : chaque arrêt ne considère que les départs >= son propre
      // bestArrival (sémantique RAPTOR originelle). Passé au batch via unnest 2-col.
      const minDepArr = markedArr.map((id) => bestArrival.get(id) ?? Infinity);

      // ── A. Batch departures : 1 requête LATERAL pour tous les stops marqués.
      //    Renvoie, par stop, les `DEPARTURE_FETCH` prochains départs triés par
      //    departure_seconds croissant (ORDER BY dans la LATERAL).
      const departuresByStop = await this.gtfsParser.getNextDeparturesBatch(
        markedArr,
        minDepArr,
        activeServiceArr,
        DEPARTURE_FETCH,
      );

      // ── B. Dedup "1er départ par route" par stop (0 DB) AVANT de fetcher les
      //    stop_times. Évite de récupérer les stop_times de TOUS les départs
      //    sur-fetchés (DEPARTURE_FETCH par stop) : on ne garde que le 1er départ
      //    de chaque route respectant le seuil per-stop, ce qui réduit drastiquement
      //    le nombre de courses à charger (les trips sont partagés entre stops d'une
      //    même ligne). Map<stopId, dep[]> = départs retenus, triés par departure.
      const keptByStop = new Map<
        string,
        { trip: GtfsTrip; route: GtfsRoute; stopTime: GtfsStopTime }[]
      >();
      const uniqueTripIds = new Set<string>();
      for (const stopId of markedArr) {
        const currentArrival = bestArrival.get(stopId) ?? Infinity;
        const departures = (departuresByStop.get(stopId) ?? [])
          .slice()
          .sort(
            (a, b) =>
              this.timeToSeconds(a.stopTime.departure_time) -
              this.timeToSeconds(b.stopTime.departure_time),
          );
        const seenRoutes = new Set<string>();
        const kept: typeof departures = [];
        for (const dep of departures) {
          if (seenRoutes.has(dep.route.route_id)) continue;
          const originDeparture = this.timeToSeconds(dep.stopTime.departure_time);
          if (originDeparture < currentArrival) continue;
          seenRoutes.add(dep.route.route_id);
          kept.push(dep);
          uniqueTripIds.add(dep.trip.trip_id);
        }
        if (kept.length > 0) keptByStop.set(stopId, kept);
      }

      // ── C. Batch trip stop_times : 1 requête pour les courses retenues
      //    (déjà dédoublonnées par route). Peuple le cache trip long-vie côté
      //    gtfsDb (invalidé au reload atomique).
      const tripStopTimesMap =
        uniqueTripIds.size > 0
          ? await this.gtfsParser.getTripStopTimesBatch([...uniqueTripIds])
          : new Map<string, GtfsStopTime[]>();

      // ── D. Traverse : 0 requête DB, on lit stop_times depuis le Map batché.
      for (const [stopId, kept] of keptByStop) {
        for (const dep of kept) {
          // dep.stopTime porte déjà stop_sequence + departure_time (séquence
          // d'arrêt d'origine), inutile de retrouver originSeq dans tripStopTimes.
          const originSeq = dep.stopTime;
          const originDeparture = this.timeToSeconds(originSeq.departure_time);

          const tripStopTimes = tripStopTimesMap.get(dep.trip.trip_id);
          if (!tripStopTimes || tripStopTimes.length === 0) continue;

          // Traverse remaining stops on this trip
          for (const st of tripStopTimes) {
            if (st.stop_sequence <= originSeq.stop_sequence) continue;

            const arrivalAtStop = this.timeToSeconds(st.arrival_time);
            const previousBest = bestArrival.get(st.stop_id) ?? Infinity;

            if (arrivalAtStop < previousBest) {
              bestArrival.set(st.stop_id, arrivalAtStop);
              cameFrom.set(st.stop_id, {
                stopId: st.stop_id,
                tripId: dep.trip.trip_id,
                routeId: dep.route.route_id,
                fromStopId: stopId,
                arrivalTime: arrivalAtStop,
                departureTime: originDeparture,
              });
              newMarkedStops.add(st.stop_id);

              // Check if we reached a destination stop
              if (destStopIds.has(st.stop_id)) {
                const destStop = destStops.find(
                  (s) => s.stop_id === st.stop_id,
                );
                if (destStop) {
                  const journey = await this.reconstructJourney(
                    st.stop_id,
                    originStops,
                    destStop,
                    cameFrom,
                    bestArrival,
                    query,
                    dep.route,
                    originSeq,
                    st,
                    tripStopTimes,
                    dep.trip,
                  );
                  if (journey) results.push(journey);
                }
              }
            }
          }
        }
      }

      // ── D. Batch foot-path transfers : 1 requête pour tous les stops nouvellement marqués.
      if (newMarkedStops.size > 0) {
        const newMarkedArr = [...newMarkedStops];
        const transfersByStop =
          await this.gtfsParser.getTransfersFromBatch(newMarkedArr);
        for (const stopId of newMarkedArr) {
          const transfers = transfersByStop.get(stopId) ?? [];
          for (const transfer of transfers) {
            const walkTimeSeconds = transfer.min_transfer_time ?? 120; // default 2 min = 120s
            const arrivalViaWalk =
              (bestArrival.get(stopId) ?? Infinity) + walkTimeSeconds;
            const previousBest =
              bestArrival.get(transfer.to_stop_id) ?? Infinity;

            if (arrivalViaWalk < previousBest) {
              bestArrival.set(transfer.to_stop_id, arrivalViaWalk);
              newMarkedStops.add(transfer.to_stop_id);
            }
          }
        }
      }

      // Update marked stops for next round
      markedStops.clear();
      for (const s of newMarkedStops) {
        markedStops.add(s);
      }

      // Early exit: aucun nouveau stop atteint ce round → inutile de continuer
      if (newMarkedStops.size === 0) break;
    }

    return results;
  }

  /**
   * Reconstruct a journey from RAPTOR cameFrom data
   */
  private async reconstructJourney(
    destStopId: string,
    originStops: GtfsStop[],
    destStop: GtfsStop,
    cameFrom: Map<
      string,
      {
        stopId: string;
        tripId: string;
        routeId: string;
        fromStopId: string;
        arrivalTime: number;
        departureTime: number;
      }
    >,
    bestArrival: Map<string, number>,
    query: JourneyQuery,
    route: GtfsRoute,
    originSeq: GtfsStopTime,
    destSeq: GtfsStopTime,
    tripStopTimes: GtfsStopTime[],
    trip: GtfsTrip,
  ): Promise<JourneyResult | null> {
    // Find the best origin stop
    let bestOriginStop = originStops[0];
    let bestOriginWalkTime = Infinity;
    for (const os of originStops) {
      const walkTime = Math.round(
        (this.haversineKm(
          query.origin.lat,
          query.origin.lon,
          os.stop_lat,
          os.stop_lon,
        ) /
          this.WALK_SPEED_KMH) *
          60,
      );
      if (walkTime < bestOriginWalkTime) {
        bestOriginWalkTime = walkTime;
        bestOriginStop = os;
      }
    }

    const walkOrigin = this.walkSegment(
      query.origin.lat,
      query.origin.lon,
      bestOriginStop.stop_lat,
      bestOriginStop.stop_lon,
      bestOriginStop.stop_name,
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
    const transitDistance = await this.estimateTransitDistance(
      tripStopTimes,
      originSeq.stop_sequence,
      destSeq.stop_sequence,
    );
    const modeName = this.getModeName(route.route_type);
    const co2 = this.carbonService.calculateFromGtfsRouteType(
      route.route_type,
      transitDistance,
    );

    // Quai / platform : porté par le stop (récupéré via findStopsNearby en amont)
    const platform = bestOriginStop.platform_code || undefined;

    const transitSegment: JourneySegment = {
      type: 'transit',
      mode: modeName,
      lineName: route.route_short_name || route.route_long_name,
      lineColor: route.route_color ? `#${route.route_color}` : undefined,
      fromStop: bestOriginStop.stop_name,
      toStop: destStop.stop_name,
      durationMinutes: transitDuration,
      distanceKm: transitDistance,
      numStops: destSeq.stop_sequence - originSeq.stop_sequence,
      departureTime: originSeq.departure_time,
      arrivalTime: destSeq.arrival_time,
      co2Ggrams: co2.emissionsGco2,
      instruction: `Prendre ${route.route_short_name || route.route_long_name} de ${bestOriginStop.stop_name} à ${destStop.stop_name}`,
      direction: trip.trip_headsign || route.route_long_name || undefined,
      headsign: trip.trip_headsign || undefined,
      platform,
      shapeId: trip.shape_id || undefined,
    };

    // Count transfers by tracing cameFrom
    let transfers = 0;
    let currentStop = destStopId;
    let prevRoute = '';
    while (cameFrom.has(currentStop)) {
      const from = cameFrom.get(currentStop)!;
      if (prevRoute && from.routeId !== prevRoute) transfers++;
      prevRoute = from.routeId;
      currentStop = from.fromStopId;
    }

    const totalDuration =
      walkOrigin.durationMinutes + transitDuration + walkDest.durationMinutes;
    const totalCo2 =
      walkOrigin.co2Ggrams + co2.emissionsGco2 + walkDest.co2Ggrams;

    return {
      durationMinutes: totalDuration,
      transfers,
      distanceKm: walkOrigin.distanceKm + transitDistance + walkDest.distanceKm,
      co2Ggrams: totalCo2,
      segments: [walkOrigin, transitSegment, walkDest],
      departureTime: originSeq.departure_time,
      arrivalTime: destSeq.arrival_time,
    };
  }

  private secondsToTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Filter journeys by requested transport modes
   */
  private filterByModes(
    journeys: JourneyResult[],
    modes?: TransportMode[],
  ): JourneyResult[] {
    if (!modes || modes.length === 0) return journeys;

    return journeys.filter((journey) => {
      const transitSegments = journey.segments.filter(
        (s) => s.type === 'transit',
      );
      if (transitSegments.length === 0) return true; // Walking/Vélib always allowed

      return transitSegments.some((segment) => {
        const mode = segment.mode?.toLowerCase() || '';
        if (modes.includes('metro') && (mode === 'métro' || mode === 'metro'))
          return true;
        if (modes.includes('rer') && (mode === 'rer' || mode === 'rer/train'))
          return true;
        if (modes.includes('bus') && mode === 'bus') return true;
        if (modes.includes('tram') && (mode === 'tramway' || mode === 'tram'))
          return true;
        if (modes.includes('transilien') && mode === 'transilien') return true;
        if (modes.includes('velib') && segment.type === 'velib') return true;
        if (modes.includes('marche') && segment.type === 'walking') return true;
        return false;
      });
    });
  }

  /**
   * Fallback intelligent : génère des itinéraires approximatifs en utilisant
   * les VRAIS arrêts GTFS à proximité (déjà chargés en mémoire).
   * Au lieu de labels génériques "Station de départ", on utilise les noms
   * d'arrêts réels trouvés par findStopsNearby().
   */
  private async computeFallbackTransitJourney(
    query: JourneyQuery,
  ): Promise<JourneyResult[]> {
    const directDistance = this.haversineKm(
      query.origin.lat,
      query.origin.lon,
      query.destination.lat,
      query.destination.lon,
    );

    const results: JourneyResult[] = [];
    const now = new Date();
    const departureTime = now.toISOString();

    // ─── VRAIS arrêts à proximité ──────────────────────────────────
    const [nearbyOriginStops, nearbyDestStops] = await Promise.all([
      this.gtfsParser.findStopsNearby(
        query.origin.lat,
        query.origin.lon,
        0.5,
        3,
      ),
      this.gtfsParser.findStopsNearby(
        query.destination.lat,
        query.destination.lon,
        0.5,
        3,
      ),
    ]);

    // Priorité : arrêt desservi par métro/RER > bus > marche
    const pickBestStop = async (
      stops: typeof nearbyOriginStops,
    ): Promise<(typeof nearbyOriginStops)[number] | null> => {
      if (stops.length === 0) return null;
      for (const s of stops) {
        const routes = await this.gtfsParser.getRoutesForStop(s.stop_id);
        if (routes.some((r) => r.route_type <= 2)) return s;
      }
      return stops[0];
    };

    const [originStop, destStop] = await Promise.all([
      pickBestStop(nearbyOriginStops),
      pickBestStop(nearbyDestStops),
    ]);

    const originName = originStop?.stop_name ?? 'Position actuelle';
    const destName = destStop?.stop_name ?? 'Destination';

    // Lignes desservant l'arrêt d'origine / destination
    const [originLines, destLines] = await Promise.all([
      originStop
        ? this.gtfsParser.getRoutesForStop(originStop.stop_id)
        : Promise.resolve([]),
      destStop
        ? this.gtfsParser.getRoutesForStop(destStop.stop_id)
        : Promise.resolve([]),
    ]);

    // Itinéraire Métro/RER (pour distances > 2km)
    if (directDistance > 2) {
      // Calcul distance marche réelle vers l'arrêt
      const walkToKm = originStop
        ? this.haversineKm(
            query.origin.lat,
            query.origin.lon,
            originStop.stop_lat,
            originStop.stop_lon,
          )
        : Math.min(0.5, directDistance * 0.15);
      const walkFromKm = destStop
        ? this.haversineKm(
            query.destination.lat,
            query.destination.lon,
            destStop.stop_lat,
            destStop.stop_lon,
          )
        : Math.min(0.5, directDistance * 0.15);
      const transitDistance = Math.max(
        0.5,
        directDistance - walkToKm - walkFromKm,
      );
      const walkToMin = Math.max(
        1,
        Math.round((walkToKm / this.WALK_SPEED_KMH) * 60),
      );
      const walkFromMin = Math.max(
        1,
        Math.round((walkFromKm / this.WALK_SPEED_KMH) * 60),
      );
      const transitMin = Math.round((transitDistance / 35) * 60);
      const totalMin = walkToMin + transitMin + walkFromMin;

      // Choisir la ligne : commune entre origin/dest si possible, sinon première ligne d'origine
      const originLineIds = new Set(originLines.map((l) => l.route_id));
      const commonLine = destLines.find((l) => originLineIds.has(l.route_id));
      const chosenLine = commonLine ?? originLines[0] ?? null;

      const lineName = chosenLine
        ? chosenLine.route_short_name || chosenLine.route_long_name
        : 'Ligne directe';
      const lineColor = chosenLine?.route_color
        ? `#${chosenLine.route_color}`
        : '#1A5A73';
      const lineMode = chosenLine
        ? chosenLine.route_type === 1
          ? 'metro'
          : chosenLine.route_type === 2
            ? 'rer'
            : chosenLine.route_type === 0
              ? 'tram'
              : 'bus'
        : 'Métro/RER';

      const co2 = this.carbonService.calculateEmissions(
        lineMode,
        transitDistance,
      );
      const waitTime = 3;

      results.push({
        durationMinutes: totalMin + waitTime,
        transfers: 0,
        distanceKm: Math.round(directDistance * 100) / 100,
        co2Ggrams: co2.emissionsGco2,
        isFallback: true,
        segments: [
          {
            type: 'walking',
            mode: 'marche',
            fromStop: 'Votre position',
            toStop: originName,
            durationMinutes: walkToMin,
            distanceKm: Math.round(walkToKm * 100) / 100,
            co2Ggrams: 0,
            instruction: `Marcher jusqu'à ${originName} (${(walkToKm * 1000).toFixed(0)}m)`,
          },
          {
            type: 'transit',
            mode: lineMode,
            lineName: lineName,
            lineColor: lineColor,
            fromStop: originName,
            toStop: destName,
            durationMinutes: transitMin,
            distanceKm: Math.round(transitDistance * 100) / 100,
            numStops: Math.max(2, Math.round(transitDistance / 1.5)),
            co2Ggrams: co2.emissionsGco2,
            instruction: `Prendre le ${lineMode === 'rer' ? 'RER' : lineMode.charAt(0).toUpperCase() + lineMode.slice(1)} ${lineName} de ${originName} à ${destName}`,
            direction: destName,
            headsign: destName,
            waitTimeMinutes: waitTime,
          },
          {
            type: 'walking',
            mode: 'marche',
            fromStop: destName,
            toStop: 'Destination',
            durationMinutes: walkFromMin,
            distanceKm: Math.round(walkFromKm * 100) / 100,
            co2Ggrams: 0,
            instruction: `Marcher jusqu'à destination (${(walkFromKm * 1000).toFixed(0)}m)`,
          },
        ],
        departureTime,
        arrivalTime: new Date(
          now.getTime() + (totalMin + waitTime) * 60000,
        ).toISOString(),
      });
    }

    // Itinéraire avec correspondance (pour distances > 5km)
    if (directDistance > 5) {
      const walkToKm = originStop
        ? this.haversineKm(
            query.origin.lat,
            query.origin.lon,
            originStop.stop_lat,
            originStop.stop_lon,
          )
        : 0.3;
      const walkFromKm = destStop
        ? this.haversineKm(
            query.destination.lat,
            query.destination.lon,
            destStop.stop_lat,
            destStop.stop_lon,
          )
        : 0.3;
      const transit1Dist = directDistance * 0.5;
      const transit2Dist = Math.max(
        0.3,
        directDistance - transit1Dist - walkToKm - walkFromKm - 0.2,
      );
      const walkToMin = Math.max(
        1,
        Math.round((walkToKm / this.WALK_SPEED_KMH) * 60),
      );
      const walkTransferMin = 5; // marche + attente correspondance
      const walkFromMin = Math.max(
        1,
        Math.round((walkFromKm / this.WALK_SPEED_KMH) * 60),
      );
      const transit1Min = Math.round((transit1Dist / 30) * 60);
      const transit2Min = Math.round((transit2Dist / 25) * 60);
      const waitMin = 5;
      const totalMin =
        walkToMin +
        transit1Min +
        waitMin +
        walkTransferMin +
        transit2Min +
        walkFromMin;
      const co2_1 = this.carbonService.calculateEmissions('rer', transit1Dist);
      const co2_2 = this.carbonService.calculateEmissions(
        'metro',
        transit2Dist,
      );

      const line1 = originLines[0];
      const line2 = destLines[0];

      results.push({
        durationMinutes: totalMin,
        transfers: 1,
        distanceKm: Math.round(directDistance * 100) / 100,
        co2Ggrams: co2_1.emissionsGco2 + co2_2.emissionsGco2,
        isFallback: true,
        segments: [
          {
            type: 'walking',
            mode: 'marche',
            fromStop: 'Votre position',
            toStop: originName,
            durationMinutes: walkToMin,
            distanceKm: Math.round(walkToKm * 100) / 100,
            co2Ggrams: 0,
            instruction: `Marcher jusqu'à ${originName} (${(walkToKm * 1000).toFixed(0)}m)`,
          },
          {
            type: 'transit',
            mode: 'rer',
            lineName: line1
              ? line1.route_short_name || line1.route_long_name
              : 'RER',
            lineColor: line1?.route_color ? `#${line1.route_color}` : '#1A5A73',
            fromStop: originName,
            toStop: 'Gare de correspondance',
            durationMinutes: transit1Min,
            distanceKm: Math.round(transit1Dist * 100) / 100,
            numStops: Math.max(2, Math.round(transit1Dist / 2)),
            co2Ggrams: co2_1.emissionsGco2,
            instruction: `Prendre le RER ${line1?.route_short_name ?? ''} de ${originName}`,
            direction: 'Correspondance',
            headsign: 'Correspondance',
            waitTimeMinutes: waitMin,
          },
          {
            type: 'walking',
            mode: 'marche',
            durationMinutes: walkTransferMin,
            distanceKm: 0.2,
            co2Ggrams: 0,
            instruction: `Correspondance à pied + attente (~${walkTransferMin} min)`,
          },
          {
            type: 'transit',
            mode: 'metro',
            lineName: line2
              ? line2.route_short_name || line2.route_long_name
              : 'Métro',
            lineColor: line2?.route_color ? `#${line2.route_color}` : '#E53935',
            fromStop: 'Gare de correspondance',
            toStop: destName,
            durationMinutes: transit2Min,
            distanceKm: Math.round(transit2Dist * 100) / 100,
            numStops: Math.max(2, Math.round(transit2Dist / 1.2)),
            co2Ggrams: co2_2.emissionsGco2,
            instruction: `Prendre le Métro ${line2?.route_short_name ?? ''} jusqu'à ${destName}`,
            direction: destName,
            headsign: destName,
          },
          {
            type: 'walking',
            mode: 'marche',
            fromStop: destName,
            toStop: 'Destination',
            durationMinutes: walkFromMin,
            distanceKm: Math.round(walkFromKm * 100) / 100,
            co2Ggrams: 0,
            instruction: `Marcher jusqu'à destination (${(walkFromKm * 1000).toFixed(0)}m)`,
          },
        ],
        departureTime,
        arrivalTime: new Date(now.getTime() + totalMin * 60000).toISOString(),
      });
    }

    return results;
  }

  /**
   * Calcule un trajet sans transport en commun (marche / vélib)
   */
  private async computeNonTransitJourney(
    query: JourneyQuery,
  ): Promise<JourneyResult[]> {
    const directDistance = this.haversineKm(
      query.origin.lat,
      query.origin.lon,
      query.destination.lat,
      query.destination.lon,
    );

    const results: JourneyResult[] = [];

    // Marche
    const walkDuration = Math.round(
      (directDistance / this.WALK_SPEED_KMH) * 60,
    );
    results.push({
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
    });

    // Vélib (si distance > 0.5km) — marche→vélo→marche avec VRAIES stations
    // On récupère les stations Vélib' réelles autour de l'origine et de la
    // destination via PRIM/Open Data Paris, et on ne propose l'alternative que
    // si une station louable existe côté départ ET une station côté arrivée.
    // Pas de constantes inventées : positions et distances réelles.
    if (directDistance > 0.5) {
      try {
        const [originStations, destStations] = await Promise.all([
          this.primService.getNearbyVelibStations(
            query.origin.lat,
            query.origin.lon,
            this.VELIB_RADIUS_KM,
            5,
          ),
          this.primService.getNearbyVelibStations(
            query.destination.lat,
            query.destination.lon,
            this.VELIB_RADIUS_KM,
            5,
          ),
        ]);

        // Première station louable (vélos dispo) côté départ
        const pickup = originStations.stations.find(
          (s) => s.is_renting && s.available_bikes > 0,
        );
        // Station la plus proche de la destination (où rendre le vélo)
        const dropoff = destStations.stations[0];

        if (pickup && dropoff) {
          const walkToStationKm = this.haversineKm(
            query.origin.lat,
            query.origin.lon,
            pickup.position.lat,
            pickup.position.lon,
          );
          const walkFromStationKm = this.haversineKm(
            dropoff.position.lat,
            dropoff.position.lon,
            query.destination.lat,
            query.destination.lon,
          );
          const bikeDistanceKm = this.haversineKm(
            pickup.position.lat,
            pickup.position.lon,
            dropoff.position.lat,
            dropoff.position.lon,
          );
          const walkToMin = Math.max(
            1,
            Math.round((walkToStationKm / this.WALK_SPEED_KMH) * 60),
          );
          const walkFromMin = Math.max(
            1,
            Math.round((walkFromStationKm / this.WALK_SPEED_KMH) * 60),
          );
          const bikeDuration = Math.round(
            (bikeDistanceKm / this.BIKE_SPEED_KMH) * 60,
          );
          const totalDuration = walkToMin + bikeDuration + walkFromMin;
          const bikeCo2 = this.carbonService.calculateEmissions(
            'velib_electrique',
            bikeDistanceKm,
          );
          const totalDistance =
            walkToStationKm + bikeDistanceKm + walkFromStationKm;

          results.push({
            durationMinutes: totalDuration,
            transfers: 0,
            distanceKm: Math.round(totalDistance * 100) / 100,
            co2Ggrams: bikeCo2.emissionsGco2,
            segments: [
              {
                type: 'walking',
                mode: 'marche',
                durationMinutes: walkToMin,
                distanceKm: Math.round(walkToStationKm * 100) / 100,
                co2Ggrams: 0,
                fromStop: 'Votre position',
                toStop: pickup.name,
                instruction: `Marcher jusqu'à ${pickup.name} (${pickup.available_bikes} vélo${pickup.available_bikes > 1 ? 's' : ''} dispo)`,
              },
              {
                type: 'velib',
                mode: 'velib_electrique',
                durationMinutes: bikeDuration,
                distanceKm: Math.round(bikeDistanceKm * 100) / 100,
                co2Ggrams: bikeCo2.emissionsGco2,
                fromStop: pickup.name,
                toStop: dropoff.name,
                instruction: `Prendre un Vélib' de ${pickup.name} à ${dropoff.name} (${bikeDistanceKm.toFixed(1)} km)`,
              },
              {
                type: 'walking',
                mode: 'marche',
                durationMinutes: walkFromMin,
                distanceKm: Math.round(walkFromStationKm * 100) / 100,
                co2Ggrams: 0,
                fromStop: dropoff.name,
                toStop: 'Destination',
                instruction: `Marcher jusqu'à destination`,
              },
            ],
            departureTime: new Date().toISOString(),
            arrivalTime: new Date(
              new Date().getTime() + totalDuration * 60000,
            ).toISOString(),
          });
        }
        // Si aucune station dispo : on n'insère pas l'alternative vélib
        // (mieux vaut ne rien proposer que mentir avec des constantes).
      } catch (error) {
        this.logger.warn(
          `Vélib alternative indisponible : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
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

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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
  private async estimateTransitDistance(
    stopTimes: GtfsStopTime[],
    fromSequence: number,
    toSequence: number,
  ): Promise<number> {
    let totalDistance = 0;
    if (stopTimes.length === 0) return 0;

    // Récupère en une seule requête les coordonnées de tous les arrêts du trip
    const stopIds = Array.from(new Set(stopTimes.map((st) => st.stop_id)));
    const coords = await this.gtfsParser.getStopCoordsByIds(stopIds);

    for (let i = fromSequence; i < toSequence; i++) {
      const st1 = stopTimes.find((st) => st.stop_sequence === i);
      const st2 = stopTimes.find((st) => st.stop_sequence === i + 1);
      if (st1 && st2) {
        const stop1 = coords.get(st1.stop_id);
        const stop2 = coords.get(st2.stop_id);
        if (stop1 && stop2) {
          totalDistance += this.haversineKm(
            stop1.lat,
            stop1.lon,
            stop2.lat,
            stop2.lon,
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
      // Build a key from transit segments (line + stops) and non-transit type
      const transitKey = j.segments
        .filter((s) => s.type === 'transit')
        .map((s) => `${s.lineName}:${s.fromStop}:${s.toStop}`)
        .join('|');
      const nonTransitKey = j.segments
        .filter((s) => s.type !== 'transit')
        .map((s) => `${s.type}:${s.mode}`)
        .join('|');
      const key = `${transitKey}||${nonTransitKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
