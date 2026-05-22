import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { History } from '../favorites/history.entity';
import { Notification } from '../notifications/notification.entity';
import { GtfsParserService } from '../transport/gtfs-parser.service';
import { PrimService } from '../transport/prim.service';

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
        .getRawMany(),
      this.historyRepo
        .createQueryBuilder('history')
        .select('history.mode', 'mode')
        .addSelect('COUNT(history.id)', 'count')
        .groupBy('history.mode')
        .getRawMany(),
    ]);

    // Calculate CO2 saved (sum of all trips)
    const co2Result = await this.historyRepo
      .createQueryBuilder('history')
      .select('SUM(history.co2)', 'total')
      .getRawOne();

    const co2SavedGrams = co2Result?.total ? Math.round(co2Result.total) : 0;

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
        co2SavedKg: Math.round(co2SavedGrams / 1000 * 10) / 10,
      },
      breakdown: {
        usersByRole: usersByRole.reduce((acc, r) => {
          acc[r.role] = parseInt(r.count, 10);
          return acc;
        }, {} as Record<string, number>),
        tripsByMode: tripsByMode.reduce((acc, r) => {
          acc[r.mode || 'unknown'] = parseInt(r.count, 10);
          return acc;
        }, {} as Record<string, number>),
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

    const notifications = users.map((user) =>
      this.notifRepo.create({
        userId: user.id,
        type: (body.type || 'info') as 'disruption' | 'delay' | 'info' | 'favorite_alert' | 'system',
        title: body.title,
        message: body.message,
        relatedLine: body.lineId || null,
        isRead: false,
      }),
    );

    await this.notifRepo.save(notifications);
    return users.length;
  }

  // ─── GTFS management ────────────────────────────────────────────────────

  async reloadGtfs() {
    await this.gtfsParser.downloadAndLoad();
    return {
      loaded: this.gtfsParser.isLoaded(),
      lastLoadTime: this.gtfsParser.getLastLoadTime(),
      stats: this.gtfsParser.isLoaded()
        ? this.gtfsParser.getStats()
        : null,
    };
  }

  async getGtfsStatus() {
    return {
      loaded: this.gtfsParser.isLoaded(),
      lastLoadTime: this.gtfsParser.getLastLoadTime(),
      stats: this.gtfsParser.isLoaded()
        ? this.gtfsParser.getStats()
        : null,
    };
  }
}
