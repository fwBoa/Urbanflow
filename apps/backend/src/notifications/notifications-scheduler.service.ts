import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Favorite } from '../favorites/favorite.entity';
import { User } from '../auth/user.entity';
import { DepartureReminderEvent, WeeklyDigestEvent } from './events';

/**
 * Cron jobs orchestrant les notifications planifiées.
 *
 * - Toutes les 5 min : rappels de départ pour les trajets favoris dans
 *   la fenêtre 10-20 min avant le départ.
 * - Tous les lundis à 8h : récap hebdomadaire personnalisé.
 */
@Injectable()
export class NotificationsSchedulerService {
  private readonly logger = new Logger(NotificationsSchedulerService.name);

  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Rappels de départ pour les trajets favoris.
   * Utilise le champ `departureTime` du favori quand il est renseigné ;
   * sinon ignore le favori (on ne notifie pas sur une estimation).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDepartureReminders(): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 10 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 20 * 60 * 1000);

    const favoriteJourneys = await this.favoriteRepo.find({
      where: { type: 'journey', departureTime: Not(IsNull()) },
    });

    const emitted = new Set<string>();
    for (const fav of favoriteJourneys) {
      const departure = fav.departureTime;
      if (!departure) continue;
      if (departure < windowStart || departure > windowEnd) continue;

      const dedupKey = `${fav.userId}|${fav.id}|${departure.toISOString().slice(0, 16)}`;
      if (emitted.has(dedupKey)) continue;
      emitted.add(dedupKey);

      this.eventEmitter.emit(
        'departure.reminder',
        new DepartureReminderEvent(
          fav.userId,
          fav.id,
          fav.mode,
          fav.from || 'Départ',
          fav.to || 'Arrivée',
          departure.toISOString(),
        ),
      );
    }

    if (emitted.size > 0) {
      this.logger.log(`Scheduled ${emitted.size} departure reminders`);
    }
  }

  /**
   * Récap hebdomadaire personnalisé — lundi à 8h.
   */
  @Cron('0 8 * * 1')
  async sendWeeklyDigests(): Promise<void> {
    const users = await this.userRepo.find({
      where: { notificationsEnabled: true },
      select: ['id'],
    });

    for (const user of users) {
      this.eventEmitter.emit('weekly.digest', new WeeklyDigestEvent(user.id));
    }

    this.logger.log(`Scheduled ${users.length} weekly digests`);
  }
}
