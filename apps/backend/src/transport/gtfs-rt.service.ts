import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface RealtimeAlert {
  id: string;
  headerText: string;
  descriptionText?: string;
  severity: 'info' | 'warning' | 'severe' | 'unknown';
  affectedRoutes: string[];
  activePeriod: { start: string; end: string }[];
  cause?: string;
  effect?: string;
}

interface PrimDisruptionMessage {
  text?: string;
}

interface PrimDisruptionLine {
  shortName?: string;
  name?: string;
}

interface PrimDisruptionSeverity {
  name?: string;
}

interface PrimDisruptionPeriod {
  begin?: string;
  start?: string;
  end?: string;
}

interface PrimDisruption {
  id?: string;
  messages?: PrimDisruptionMessage[];
  severity?: PrimDisruptionSeverity;
  status?: string;
  cause?: string;
  effect?: string;
  lignes?: PrimDisruptionLine[];
  lineIds?: string[];
  routesAffected?: string[];
  startDate?: string;
  endDate?: string;
  debut?: string;
  fin?: string;
  applicationPeriods?: PrimDisruptionPeriod[];
}

interface PrimDisruptionsResponse {
  disruptions?: PrimDisruption[];
}

/**
 * GTFS-RT (Realtime) Service
 *
 * Intègre les données temps réel :
 * - Alertes et perturbations via API Navitia disruptions
 * - Positions des véhicules : non disponibles (endpoint obsolète)
 *
 * Sources :
 * - PRIM Navitia API : disruptions (nécessite clé API)
 * - Fallback : données statiques GTFS si RT indisponible
 *
 * Note : Les anciens endpoints /v1/traffic et /v1/gtfs-rt sont obsolètes.
 * On utilise maintenant l'API Navitia disruptions pour les alertes.
 */
@Injectable()
export class GtfsRtService {
  private readonly logger = new Logger(GtfsRtService.name);
  private readonly primApiKey: string;
  private readonly primApiUrl: string;

  /** Cache des alertes temps réel */
  private alertsCache: RealtimeAlert[] = [];
  private alertsLastRefresh = 0;
  private readonly ALERTS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

  constructor(private readonly httpService: HttpService) {
    this.primApiKey = process.env.PRIM_API_KEY || '';
    this.primApiUrl =
      process.env.PRIM_API_URL || 'https://prim.iledefrance-mobilites.fr';
    if (!this.primApiKey) {
      this.logger.warn(
        'PRIM_API_KEY is not set. Realtime alerts will be unavailable (register at https://prim.iledefrance-mobilites.fr/).',
      );
    }
  }

  /**
   * Récupère les alertes/perturbations temps réel
   * Utilise l'API PRIM traffic comme source
   */
  async getAlerts(): Promise<RealtimeAlert[]> {
    const now = Date.now();
    if (
      this.alertsCache.length > 0 &&
      now - this.alertsLastRefresh < this.ALERTS_CACHE_TTL_MS
    ) {
      return this.alertsCache;
    }

    try {
      const alerts = await this.fetchPrimAlerts();
      this.alertsCache = alerts;
      this.alertsLastRefresh = now;
      return alerts;
    } catch (e: unknown) {
      this.logger.warn(
        `Failed to fetch realtime alerts: ${e instanceof Error ? e.message : String(e)}`,
      );
      return this.alertsCache; // Return stale cache
    }
  }

  /**
   * Fetch alerts from PRIM API using Navitia disruptions endpoint
   * The old /v1/traffic endpoint is obsolete.
   */
  private async fetchPrimAlerts(): Promise<RealtimeAlert[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PrimDisruptionsResponse>(
          `${this.primApiUrl}/marketplace/v2/navitia/disruptions`,
          {
            headers: { apikey: this.primApiKey },
            timeout: 10000,
          },
        ),
      );

      const data = response.data;
      if (!data?.disruptions) return [];

      // Navitia disruptions format
      const disruptions = data.disruptions ?? [];

      return disruptions.slice(0, 50).map((d, i) => ({
        id: d.id || `alert-${i}`,
        headerText: d.messages?.[0]?.text || 'Perturbation',
        descriptionText:
          d.messages?.map((m) => m.text).join(' — ') || undefined,
        severity: this.mapSeverity(d.severity?.name || d.status),
        affectedRoutes: this.extractAffectedRoutes(d),
        activePeriod: this.extractActivePeriod(d),
        cause: d.cause || undefined,
        effect: d.effect || undefined,
      }));
    } catch (e: unknown) {
      this.logger.warn(
        `PRIM Navitia disruptions API unavailable: ${e instanceof Error ? e.message : String(e)}`,
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

  private extractAffectedRoutes(d: PrimDisruption): string[] {
    const routes: string[] = [];
    if (d.lignes) {
      for (const l of d.lignes) {
        const name = l.shortName || l.name;
        if (name) routes.push(name);
      }
    }
    if (d.lineIds) routes.push(...d.lineIds);
    if (d.routesAffected) routes.push(...d.routesAffected);
    return routes;
  }

  private extractActivePeriod(
    d: PrimDisruption,
  ): { start: string; end: string }[] {
    const periods: { start: string; end: string }[] = [];
    if (d.startDate || d.endDate) {
      periods.push({
        start: d.startDate || d.debut || new Date().toISOString(),
        end: d.endDate || d.fin || new Date().toISOString(),
      });
    }
    if (d.applicationPeriods) {
      for (const p of d.applicationPeriods) {
        periods.push({
          start: p.begin || p.start || '',
          end: p.end || '',
        });
      }
    }
    return periods.length > 0
      ? periods
      : [{ start: new Date().toISOString(), end: '' }];
  }

  /**
   * Cron: refresh alerts every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCronRefresh() {
    this.logger.debug('Refreshing GTFS-RT alerts (cron)...');
    await this.getAlerts().catch(() => {});
  }
}
