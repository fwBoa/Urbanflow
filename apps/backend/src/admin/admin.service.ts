import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../auth/user.entity';
import { History } from '../favorites/history.entity';
import { Notification } from '../notifications/notification.entity';
import { GtfsParserService } from '../transport/gtfs-parser.service';
import { PrimService } from '../transport/prim.service';
import {
  BroadcastNotificationEvent,
  BadgeUnlockedEvent,
} from '../notifications/events';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(History)
    private readonly historyRepo: Repository<History>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly gtfsParser: GtfsParserService,
    private readonly primService: PrimService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Dashboard stats ────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalUsers,
      totalTrips,
      totalNotifications,
      usersByRole,
      tripsByMode,
    ] = await Promise.all([
      this.userRepo.count(),
      this.historyRepo.count(),
      this.notifRepo.count(),
      this.userRepo
        .createQueryBuilder('user')
        .select('user.role', 'role')
        .addSelect('COUNT(user.id)', 'count')
        .groupBy('user.role')
        .getRawMany<{ role: string; count: string }>(),
      this.historyRepo
        .createQueryBuilder('history')
        .select('history.mode', 'mode')
        .addSelect('COUNT(history.id)', 'count')
        .groupBy('history.mode')
        .getRawMany<{ mode: string; count: string }>(),
    ]);

    // Calculate CO2 saved (sum of all trips)
    const co2Result = await this.historyRepo
      .createQueryBuilder('history')
      .select('SUM(history.co2)', 'total')
      .getRawOne<{ total: string | number | null }>();

    const co2SavedGrams = co2Result?.total
      ? Math.round(Number(co2Result.total))
      : 0;

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentUsers = await this.userRepo
      .createQueryBuilder('user')
      .where('user.createdAt >= :date', { date: sevenDaysAgo })
      .getCount();

    const recentTrips = await this.historyRepo
      .createQueryBuilder('history')
      .where('history.tripDate >= :date', { date: sevenDaysAgo })
      .getCount();

    return {
      totals: {
        users: totalUsers,
        trips: totalTrips,
        notifications: totalNotifications,
        co2SavedKg: Math.round((co2SavedGrams / 1000) * 10) / 10,
      },
      breakdown: {
        usersByRole: usersByRole.reduce(
          (acc, r) => {
            acc[r.role] = parseInt(r.count, 10);
            return acc;
          },
          {} as Record<string, number>,
        ),
        tripsByMode: tripsByMode.reduce(
          (acc, r) => {
            acc[r.mode || 'unknown'] = parseInt(r.count, 10);
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      activity: {
        newUsersLast7Days: recentUsers,
        tripsLast7Days: recentTrips,
      },
    };
  }

  // ─── User management ────────────────────────────────────────────────────

  async getAllUsers() {
    return this.userRepo.find({
      select: [
        'id',
        'email',
        'displayName',
        'role',
        'createdAt',
        'lastLoginAt',
        'consentGeoloc',
        'consentHistory',
        'deletedAt',
      ],
      withDeleted: true,
      order: { createdAt: 'DESC' },
    });
  }

  async getUserById(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!user) {
      return null;
    }

    // Get user's trip count
    const tripCount = await this.historyRepo.count({ where: { userId: id } });

    // Get user's notification count
    const notifCount = await this.notifRepo.count({ where: { userId: id } });

    return {
      ...user,
      tripCount,
      notifCount,
    };
  }

  async deleteUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Soft delete (RGPD compliant - data retained for 30 days)
    await this.userRepo.softDelete(id);
    return { message: 'Utilisateur supprimé (soft delete)' };
  }

  // ─── Trip management ────────────────────────────────────────────────────

  async getAllTrips(limit: number, offset: number) {
    const [trips, total] = await this.historyRepo.findAndCount({
      take: limit,
      skip: offset,
      order: { tripDate: 'DESC' },
      relations: ['user'],
    });

    return {
      data: trips,
      total,
      limit,
      offset,
    };
  }

  // ─── Notification management ────────────────────────────────────────────

  async getAllNotifications() {
    return this.notifRepo.find({
      take: 100,
      order: { createdAt: 'DESC' },
    });
  }

  async broadcastNotification(body: {
    title: string;
    message: string;
    type?: string;
    lineId?: string;
  }) {
    const users = await this.userRepo.find({
      where: { notificationsEnabled: true },
      select: ['id'],
    });

    if (users.length === 0) return 0;

    this.eventEmitter.emit(
      'broadcast.notification',
      new BroadcastNotificationEvent(
        body.title,
        body.message,
        (body.type || 'info') as
          | 'disruption'
          | 'delay'
          | 'info'
          | 'favorite_alert'
          | 'system',
        body.lineId,
      ),
    );

    return users.length;
  }

  // ─── GTFS management ────────────────────────────────────────────────────

  async reloadGtfs() {
    // `force=true` : reload admin explicite — on rafraîchit toujours, même si
    // loaded=TRUE (le garde skip-if-loaded de loadFromZip est réservé au boot).
    await this.gtfsParser.downloadAndLoad(true);
    const loaded = await this.gtfsParser.isLoaded();
    return {
      loaded,
      lastLoadTime: await this.gtfsParser.getLastLoadTime(),
      stats: loaded ? await this.gtfsParser.getStats() : null,
    };
  }

  async getGtfsStatus() {
    const loaded = await this.gtfsParser.isLoaded();
    return {
      loaded,
      lastLoadTime: await this.gtfsParser.getLastLoadTime(),
      stats: loaded ? await this.gtfsParser.getStats() : null,
    };
  }

  /**
   * Santé des services internes — vue opérateur pour l'admin.
   * Chaque check est best-effort : un service dégradé ne doit pas faire
   * échouer le rapport des autres (c'est précisément l'info qu'on veut).
   * L'état SQL de chaque sous-système (ex. table badge_unlocks joignable)
   * permet de détecter les bugs de mapping/colonnes qui échouent
   * silencieusement ailleurs (Bloc 80).
   */
  async getServicesHealth() {
    const checks: Array<{
      name: string;
      status: 'up' | 'down';
      detail?: string;
      latencyMs?: number;
    }> = [];

    // 1. PostgreSQL — la requête la plus simple possible + latence.
    const dbStart = Date.now();
    try {
      await this.userRepo.query('SELECT 1');
      checks.push({
        name: 'PostgreSQL',
        status: 'up',
        latencyMs: Date.now() - dbStart,
      });
    } catch (err) {
      checks.push({
        name: 'PostgreSQL',
        status: 'down',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Table badge_unlocks joignable (le bug silencieux du Bloc 80).
    try {
      const count = await this.userRepo.manager
        .getRepository('BadgeUnlock')
        .count();
      checks.push({
        name: 'Badges (badge_unlocks)',
        status: 'up',
        detail: `${count} badge(s) débloqué(s)`,
      });
    } catch (err) {
      checks.push({
        name: 'Badges (badge_unlocks)',
        status: 'down',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // 3. Navitia PRIM — ping des disruptions (source des alertes).
    const primStart = Date.now();
    try {
      const reachable = await this.primService.checkConnectivity();
      checks.push({
        name: 'Navitia PRIM',
        status: reachable ? 'up' : 'down',
        latencyMs: Date.now() - primStart,
      });
    } catch (err) {
      checks.push({
        name: 'Navitia PRIM',
        status: 'down',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. GTFS chargé.
    const gtfsLoaded = await this.gtfsParser.isLoaded();
    checks.push({
      name: 'GTFS (données réseau)',
      status: gtfsLoaded ? 'up' : 'down',
      detail: gtfsLoaded ? undefined : 'Données non chargées',
    });

    const allUp = checks.every((c) => c.status === 'up');
    return {
      status: allUp ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Force le déblocage d'un badge pour tester la chaîne complète
   * (notification in-app + push + célébration) sans attendre les seuils
   * réels. Utilise la même porte que le déblocage organique : l'événement
   * `badge.unlocked` est émis, le listener fait le reste.
   */
  async forceBadgeUnlock(
    userId: string,
    badgeKey: string,
  ): Promise<{
    unlocked: boolean;
    badge?: { key: string; label: string; emoji: string };
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Utilisateur ${userId} introuvable`);

    const BADGE_CATALOG: Record<string, { label: string; emoji: string }> = {
      first_trip: { label: 'Premier trajet', emoji: '🎉' },
      eco_warrior: { label: 'Éco-guerrier', emoji: '🌿' },
      explorer: { label: 'Explorateur', emoji: '🗺️' },
      regular: { label: 'Régulier', emoji: '🚇' },
      velib_fan: { label: "Vélib' fan", emoji: '🚲' },
      carbon_neutral: { label: 'Carbone neutre', emoji: '🌍' },
    };
    const def = BADGE_CATALOG[badgeKey];
    if (!def) {
      throw new NotFoundException(
        `Badge inconnu : ${badgeKey} (disponibles : ${Object.keys(BADGE_CATALOG).join(', ')})`,
      );
    }

    // Persiste directement (idempotent) puis émet — le listener notifie.
    const existing: Array<{ id: string }> = await this.userRepo.manager.query(
      'SELECT id FROM badge_unlocks WHERE user_id = $1 AND badge_key = $2',
      [userId, badgeKey],
    );
    if (existing.length > 0) {
      return { unlocked: false, badge: { key: badgeKey, ...def } };
    }
    await this.userRepo.manager.query(
      'INSERT INTO badge_unlocks (user_id, badge_key, metadata, unlocked_at) VALUES ($1, $2, $3::jsonb, now())',
      [userId, badgeKey, JSON.stringify({ forcedByAdmin: true })],
    );
    this.eventEmitter.emit(
      'badge.unlocked',
      new BadgeUnlockedEvent(userId, badgeKey, def.label, def.emoji),
    );
    return { unlocked: true, badge: { key: badgeKey, ...def } };
  }
}
