import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type {
  JourneyResult,
  JourneySegment,
  TransportMode,
} from './journey.service';
import type { RealtimeAlert } from './gtfs-rt.service';

/**
 * Service d'intégration PRIM Navitia (Calculateur IDFM — accès générique v2).
 *
 * Rôle dans l'architecture hybride : couche PRIMAIRE pour le calcul d'itinéraires
 * et les perturbations temps réel. Le RAPTOR/GTFS (journey.service) reste le filet
 * hors-ligne : si Navitia est KO (réseau, quota 1000 req/jour dépassé, 5xx), le
 * controller repli sur GTFS. Les arrêts proches / recherche par nom / départs
 * restent servis par GTFS (local, gratuit, insensible au quota).
 *
 * Auth : header `apikey:` (cf. doc PRIM). La clé doit être abonnée au produit
 * « Calculateur Ile-de-France Mobilités – Accès générique (v2) » sur le
 * marketplace PRIM ; sans cela, l'API répond `{"message":"Unauthorized"}`.
 *
 * Quotas : tokens post-mars-2024 → 5 req/s, 1000 req/jour. Un cache TTL 60s
 * borne la consommation (clé = path+params triés).
 *
 * Doc : https://prim.iledefrance-mobilites.fr/en/apis/idfm-navitia-general-v2
 * Base : https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia
 */
@Injectable()
export class NavitiaService {
  private readonly logger = new Logger(NavitiaService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs = 15_000;

  /** Cache LRU/TTL — préserve le quota (1000 req/jour tokens récents). */
  private readonly cache = new Map<string, { data: unknown; expiry: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 1 min
  private readonly CACHE_MAX = 200;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService
      .get<string>('PRIM_API_URL', 'https://prim.iledefrance-mobilites.fr')
      .replace(/\/$/, '');
    this.apiKey = this.configService.get<string>('PRIM_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn(
        'PRIM_API_KEY is not set — Navitia routing/alerts disabled (GTFS fallback used).',
      );
    }
  }

  /** Indique si Navitia est utilisable (clé configurée). */
  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  // ─── Cache ───────────────────────────────────────────────────────────

  private cacheKey(
    path: string,
    params: Record<string, string | string[]>,
  ): string {
    const norm: Record<string, string> = {};
    for (const k of Object.keys(params).sort()) {
      const v = params[k];
      norm[k] = Array.isArray(v) ? [...v].sort().join('|') : v;
    }
    return `${path}?${new URLSearchParams(norm).toString()}`;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached(key: string, data: unknown): void {
    if (this.cache.size >= this.CACHE_MAX) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { data, expiry: Date.now() + this.CACHE_TTL_MS });
  }

  // ─── Appel HTTP de base ──────────────────────────────────────────────

  /**
   * Appel authentifié vers Navitia. Lève en cas de non-200 (le caller repli
   * sur GTFS). Cache TTL 60s pour préserver le quota.
   */
  private async callNavitia<T>(
    path: string,
    params: Record<string, string | string[]> = {},
  ): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error('PRIM_API_KEY not configured');
    }
    const key = this.cacheKey(path, params);
    const cached = this.getCached<T>(key);
    if (cached) return cached;

    const url = `${this.baseUrl}/marketplace/v2/navitia${path}`;
    const response = await firstValueFrom(
      this.httpService.get<T>(url, {
        params,
        headers: {
          apikey: this.apiKey,
          Accept: 'application/json',
        },
        timeout: this.timeoutMs,
      }),
    );
    this.setCached(key, response.data);
    return response.data;
  }

  // ─── Itinéraires (journeys) ───────────────────────────────────────────

  /**
   * Calcule des itinéraires via Navitia `journeys` et mappe vers le format
   * `JourneyResult` attendu par le frontend. La géométrie réelle de chaque
   * section est embarquée dans `segments[].geojson` (paires [lon, lat]).
   *
   * @throws si Navitia injoignable / Unauthorized → le controller repli GTFS.
   */
  async findJourneys(
    origin: { lat: number; lon: number },
    destination: { lat: number; lon: number },
    departureTime?: string,
    modes?: TransportMode[],
    maxTransfers?: number,
  ): Promise<JourneyResult[]> {
    const params: Record<string, string | string[]> = {
      from: `${origin.lon};${origin.lat}`,
      to: `${destination.lon};${destination.lat}`,
      count: '5',
    };
    if (departureTime) {
      // ISO → Navitia "YYYYMMDDTHHMMSS"
      params.datetime = this.toNavitiaDatetime(new Date(departureTime));
      params.datetime_represents = 'departure';
    }
    if (maxTransfers !== undefined) {
      params.max_transfers = String(maxTransfers);
    }
    // Filtre modes : on interdit les physical_modes non sélectionnés.
    const forbidden = this.forbiddenUrisForModes(modes);
    if (forbidden.length > 0) params.forbidden_uris = forbidden;

    const data = await this.callNavitia<NavitiaJourneysResponse>(
      '/journeys',
      params,
    );
    if (!data?.journeys?.length) return [];
    return data.journeys.slice(0, 5).map((j) => this.mapJourney(j));
  }

  /**
   * Mappe un journey Navitia → JourneyResult. Conserve la géométrie (geojson)
   * par section pour que la carte trace la vraie trajectoire sans /shape.
   */
  private mapJourney(j: NavitiaJourney): JourneyResult {
    const segments: JourneySegment[] = [];
    let totalDistanceKm = 0;
    let totalCo2 = 0;

    for (const section of j.sections ?? []) {
      const seg = this.mapSection(section);
      if (!seg) continue;
      totalDistanceKm += seg.distanceKm;
      totalCo2 += seg.co2Ggrams;
      segments.push(seg);
    }

    // CO₂ global Navitia (gEC) si présent — plus fiable que la somme des sections.
    if (typeof j.co2_emission?.value === 'number') {
      totalCo2 = Math.round(j.co2_emission.value);
    }

    const departureTime = this.fromNavitiaTime(j.departure_date_time);
    const arrivalTime = this.fromNavitiaTime(j.arrival_date_time);

    return {
      durationMinutes: Math.round((j.duration ?? 0) / 60),
      transfers: j.nb_transfers ?? 0,
      distanceKm: Math.round(totalDistanceKm * 10) / 10,
      co2Ggrams: Math.round(totalCo2),
      segments,
      departureTime,
      arrivalTime,
    };
  }

  /**
   * Mappe une section Navitia → JourneySegment.
   * - public_transport → transit (ligne, mode, headsign, geojson, numStops)
   * - street_network/crow_fly/transfer/waiting/... → walking (ou velib si bike)
   */
  private mapSection(section: NavitiaSection): JourneySegment | null {
    const fromName = section.from?.name ?? '';
    const toName = section.to?.name ?? '';
    const durationMin = Math.round((section.duration ?? 0) / 60);
    const geojson = this.extractGeojson(section);
    const distanceKm = geojson ? this.polylineDistanceKm(geojson) : 0;
    const depTime = this.fromNavitiaTime(section.departure_date_time);
    const arrTime = this.fromNavitiaTime(section.arrival_date_time);
    const co2 =
      typeof section.co2_emission?.value === 'number'
        ? Math.round(section.co2_emission.value)
        : 0;

    if (section.type === 'public_transport') {
      const info = section.display_informations ?? {};
      const lineName = info.code || info.name || info.label || '';
      const lineId = info.code || undefined;
      const lineColor = info.color ? `#${info.color}` : undefined;
      const mode = info.commercial_mode || info.physical_mode || 'Transport';
      const numStops = section.stop_date_times?.length ?? 0;
      return {
        type: 'transit',
        mode,
        lineName,
        lineId,
        lineColor,
        fromStop: fromName,
        toStop: toName,
        durationMinutes: durationMin,
        distanceKm: Math.round(distanceKm * 10) / 10,
        numStops: numStops > 0 ? numStops - 1 : 0,
        departureTime: depTime,
        arrivalTime: arrTime,
        co2Ggrams: co2,
        instruction: `Prendre ${lineName || mode} de ${fromName} à ${toName}`,
        direction: info.direction || undefined,
        headsign: info.headsign || info.direction || undefined,
        geojson,
      };
    }

    // Sections non transport : street_network / crow_fly / transfer / waiting…
    const modeLower = (section.mode || 'walking').toLowerCase();
    const isBike =
      modeLower === 'bike' || modeLower === 'bicyle' || modeLower === 'bss';
    if (isBike) {
      return {
        type: 'velib',
        mode: "Vélib'",
        lineName: "Vélib'",
        lineColor: '#7CB342',
        fromStop: fromName || 'Station Vélib départ',
        toStop: toName || 'Station Vélib arrivée',
        durationMinutes: durationMin,
        distanceKm: Math.round(distanceKm * 10) / 10,
        departureTime: depTime,
        arrivalTime: arrTime,
        co2Ggrams: 0,
        instruction: `Vélib' de ${fromName} à ${toName} (${durationMin} min)`,
        geojson,
      };
    }

    // Marche (y compris crow_fly de durée 0 — rendu filtré par JourneyLine si from===to)
    return {
      type: 'walking',
      mode: 'marche',
      fromStop: fromName,
      toStop: toName,
      durationMinutes: durationMin,
      distanceKm: Math.round(distanceKm * 10) / 10,
      departureTime: depTime,
      arrivalTime: arrTime,
      co2Ggrams: 0,
      instruction:
        durationMin > 0
          ? `Marcher de ${fromName} à ${toName} (${durationMin} min)`
          : fromName,
      geojson,
    };
  }

  /** Extrait les coordonnées [lon, lat] du geojson LineString d'une section. */
  private extractGeojson(
    section: NavitiaSection,
  ): Array<[number, number]> | undefined {
    const coords = section.geojson?.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) return undefined;
    // Navitia renvoie déjà des paires [lon, lat] — on normalise en nombres.
    return coords
      .map((c) => {
        if (!Array.isArray(c) || c.length < 2) return null;
        const lon = typeof c[0] === 'string' ? parseFloat(c[0]) : c[0];
        const lat = typeof c[1] === 'string' ? parseFloat(c[1]) : c[1];
        if (Number.isNaN(lon) || Number.isNaN(lat)) return null;
        return [lon, lat] as [number, number];
      })
      .filter((p): p is [number, number] => p !== null);
  }

  /** Distance totale d'une polyline (km) — somme haversine des segments. */
  private polylineDistanceKm(points: Array<[number, number]>): number {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this.haversineKm(
        points[i - 1][1],
        points[i - 1][0],
        points[i][1],
        points[i][0],
      );
    }
    return total;
  }

  // ─── Alertes temps réel (disruptions) ─────────────────────────────────

  /**
   * Perturbations temps réel via Navitia `disruptions`. Remplace l'ancien
   * gtfs-rt.service (qui échouait en 401 avec l'ancienne clé non abonnée).
   * Repli : cache stale si l'appel échoue.
   */
  async getAlerts(): Promise<RealtimeAlert[]> {
    try {
      const data = await this.callNavitia<NavitiaDisruptionsResponse>(
        '/disruptions',
        { count: '50' },
      );
      return (data.disruptions ?? []).slice(0, 50).map((d, i) => ({
        id: d.id || `alert-${i}`,
        // Les messages Navitia sont du HTML (ex. "<p>La ligne 72…</p>") :
        // on strip les balises + collapse les espaces pour un affichage propre.
        headerText: this.stripHtml(d.messages?.[0]?.text) || 'Perturbation',
        descriptionText:
          this.stripHtml(d.messages?.map((m) => m.text).join(' — ')) ||
          undefined,
        severity: this.mapSeverity(d.severity?.name || d.status),
        affectedRoutes: this.extractAffectedRoutes(d),
        lineId: this.extractLineId(d),
        activePeriod: this.extractActivePeriod(d),
        cause: d.cause || undefined,
        effect: d.effect || undefined,
      }));
    } catch (e) {
      this.logger.warn(
        `Navitia disruptions unavailable: ${e instanceof Error ? e.message : e}`,
      );
      return [];
    }
  }

  private mapSeverity(
    severity: string | undefined,
  ): 'info' | 'warning' | 'severe' | 'unknown' {
    if (!severity) return 'unknown';
    const s = severity.toLowerCase();
    if (
      s.includes('bloqu') ||
      s.includes('critical') ||
      s.includes('severe') ||
      s.includes('grave')
    )
      return 'severe';
    if (
      s.includes('perturb') ||
      s.includes('warning') ||
      s.includes('important')
    )
      return 'warning';
    if (s.includes('info') || s.includes('normal')) return 'info';
    return 'unknown';
  }

  private extractAffectedRoutes(d: NavitiaDisruption): string[] {
    const routes: string[] = [];
    for (const l of d.impacted_objects ?? []) {
      const pt = l.pt_object;
      if (pt?.name) routes.push(pt.name);
      if (pt?.code) routes.push(pt.code);
    }
    return [...new Set(routes)];
  }

  /**
   * Extrait un identifiant technique stable de la ligne impactée depuis
   * `pt_object.code` (identifiant opérateur/maintenu par le transporteur).
   * Cela permet de matcher une alerte avec les lignes favorites enregistrées
   * sous `lineId`, indépendamment des libellés francisés susceptibles de changer.
   */
  private extractLineId(d: NavitiaDisruption): string | undefined {
    for (const l of d.impacted_objects ?? []) {
      const pt = l.pt_object;
      const code = pt?.code ?? pt?.line?.code;
      if (code) return code;
    }
    return undefined;
  }

  private extractActivePeriod(
    d: NavitiaDisruption,
  ): { start: string; end: string }[] {
    const periods: { start: string; end: string }[] = [];
    for (const p of d.application_periods ?? []) {
      periods.push({
        start: p.begin || p.start || '',
        end: p.end || '',
      });
    }
    return periods.length > 0
      ? periods
      : [{ start: new Date().toISOString(), end: '' }];
  }

  // ─── Filtre modes → forbidden_uris Navitia ───────────────────────────

  /**
   * Convertit les modes souhaités en `forbidden_uris` Navitia (physical_mode
   * à interdire). Navitia interdit par liste : on interdit tout ce qui n'est
   * pas explicitement demandé (quand une liste de modes est fournie).
   * Marche toujours autorisée (transit/accès impossible sinon).
   *
   * Par défaut (aucun mode précisé), on autorise tous les transports en commun
   * mais PAS le Vélib' (bike-sharing). Il faut explicitement demander 'velib'
   * pour l'inclure.
   */
  private forbiddenUrisForModes(modes?: TransportMode[]): string[] {
    const all = [
      'Metro',
      'Bus',
      'Tramway',
      'Rail',
      'RapidTransit',
      'Funicular',
      'Shuttle',
      'Bike',
    ];
    const want = new Set<string>();
    for (const m of modes || []) {
      if (m === 'metro') want.add('Metro');
      if (m === 'rer' || m === 'transilien') {
        want.add('RapidTransit');
        want.add('Rail');
      }
      if (m === 'tram') want.add('Tramway');
      if (m === 'bus') want.add('Bus');
      if (m === 'velib') want.add('Bike');
    }

    // Aucun mode précisé → transport en commun uniquement, Vélib' interdit.
    if (want.size === 0) {
      return ['physical_mode:Bike'];
    }

    // Si l'utilisateur demande seulement marche/velib (pas de transit),
    // on interdit tous les modes de transport en commun.
    const hasTransit =
      want.has('Metro') ||
      want.has('Bus') ||
      want.has('Tramway') ||
      want.has('Rail') ||
      want.has('RapidTransit');
    if (!hasTransit) {
      return all.filter((m) => !want.has(m)).map((m) => `physical_mode:${m}`);
    }

    // Sinon on filtre normalement : on interdit ce qui n'est pas demandé.
    return all.filter((m) => !want.has(m)).map((m) => `physical_mode:${m}`);
  }

  // ─── Utilitaires temps ───────────────────────────────────────────────

  /** Date JS → "YYYYMMDDTHHMMSS" (Navitia, fuseau Europe/Paris via Intl). */
  private toNavitiaDatetime(date: Date): string {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
    const parts = time.split(':').map(Number);
    let h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    const s = parts[2] ?? 0;
    if (h === 24) h = 0;
    return `${ymd.replace(/-/g, '')}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${String(s).padStart(2, '0')}`;
  }

  /** "20260706T104818" → "10:48:18" (HH:MM:SS, format attendu par le frontend). */
  private fromNavitiaTime(navitiaTime?: string): string {
    if (!navitiaTime) return '';
    const t = navitiaTime.split('T')[1];
    if (!t || t.length < 6) return '';
    return `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
  }

  /**
   * Retire les balises HTML des messages Navitia (renvoyés en HTML) et
   * collapse les espaces / sauts de ligne. "<p>La ligne 72…</p>" → "La ligne 72…".
   */
  private stripHtml(html: string | undefined): string {
    if (!html) return '';
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

// ─── Types Navitia (subset utilisé) ────────────────────────────────────

interface NavitiaJourneysResponse {
  journeys?: NavitiaJourney[];
}

interface NavitiaJourney {
  duration: number;
  nb_transfers?: number;
  departure_date_time?: string;
  arrival_date_time?: string;
  sections?: NavitiaSection[];
  co2_emission?: { value: number; unit: string };
}

interface NavitiaSection {
  id?: string;
  type: string; // public_transport | street_network | crow_fly | transfer | waiting | …
  mode?: string; // walking | bike | car | … (street_network)
  from?: { name?: string; id?: string };
  to?: { name?: string; id?: string };
  departure_date_time?: string;
  arrival_date_time?: string;
  duration?: number;
  geojson?: {
    type: string;
    coordinates: Array<[number, number] | [string, string]>;
  };
  display_informations?: {
    code?: string;
    name?: string;
    label?: string;
    color?: string;
    commercial_mode?: string;
    physical_mode?: string;
    direction?: string;
    headsign?: string;
    network?: string;
  };
  stop_date_times?: Array<{ stop_point?: { name?: string } }>;
  co2_emission?: { value: number; unit: string };
}

interface NavitiaDisruptionsResponse {
  disruptions?: NavitiaDisruption[];
}

interface NavitiaDisruption {
  id?: string;
  status?: string;
  cause?: string;
  effect?: string;
  severity?: { name?: string };
  messages?: Array<{ text: string }>;
  application_periods?: Array<{ begin?: string; end?: string; start?: string }>;
  impacted_objects?: Array<{
    pt_object?: { name?: string; code?: string; line?: { code?: string } };
  }>;
}
