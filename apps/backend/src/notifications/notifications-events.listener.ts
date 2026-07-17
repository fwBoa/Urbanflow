import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In, Raw, type FindOptionsWhere } from 'typeorm';
import { User } from '../auth/user.entity';
import { Favorite } from '../favorites/favorite.entity';
import { Notification } from './notification.entity';
import { PushService } from './push.service';
import {
  AlertsUpdatedEvent,
  AlertInfo,
  BroadcastNotificationEvent,
  DepartureReminderEvent,
  JourneyDisruptionEvent,
  WeeklyDigestEvent,
} from './events';

/**
 * Consommateur d'événements métier pour les notifications.
 *
 * Pour `alerts.updated` (GTFS-RT) :
 *  1. Filtre les utilisateurs cibles : notifications activées ET favori sur
 *     une ligne affectée par l'alerte.
 *  2. Persiste une notification in-app par utilisateur concerné (dédoublonnage
 *     via `externalAlertId` sur 24 h).
 *  3. Envoie une notification push asynchrone aux utilisateurs cibles.
 *
 * Pour `broadcast.notification` (admin) : notifie tous les utilisateurs abonnés.
 *
 * Cette approche événementielle découple le polling GTFS-RT du push et
 * permet de traiter les envois en arrière-plan sans bloquer la requête
 * HTTP initiale.
 */
@Injectable()
export class NotificationsEventsListener {
  private readonly logger = new Logger(NotificationsEventsListener.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    private readonly pushService: PushService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('alerts.updated', { async: true })
  async handleAlertsUpdated({ alerts }: AlertsUpdatedEvent): Promise<void> {
    if (alerts.length === 0) return;

    // Deux ensembles pour matcher les favoris ligne/trajet avec les alertes :
    // - lineId : identifiant technique stable (code opérateur), stocké sur les
    //   favoris de type 'line' — le matching est fiable.
    // - routeNames : noms d'affichage extraits de l'alerte (fallback pour les
    //   favoris trajet qui ne conservent pas de lineId).
    const affectedLineIds = new Set<string>();
    const affectedRouteNames = new Set<string>();
    for (const alert of alerts) {
      if (alert.lineId) affectedLineIds.add(alert.lineId);
      for (const route of alert.affectedRoutes) {
        affectedRouteNames.add(route.toLowerCase());
      }
    }
    if (affectedLineIds.size === 0 && affectedRouteNames.size === 0) {
      this.logger.debug(
        'Alerts have no affected routes, skipping targeted notifications',
      );
      return;
    }

    const lineIds = Array.from(affectedLineIds);
    const routeNames = Array.from(affectedRouteNames);

    const whereClauses: Array<FindOptionsWhere<Favorite>> = [];
    if (lineIds.length > 0) {
      whereClauses.push({ lineId: In(lineIds) });
    }
    if (routeNames.length > 0) {
      whereClauses.push({
        mode: Raw((alias) => `LOWER(${alias}) IN (:...routes)`, {
          routes: routeNames,
        }),
      });
    }

    const matchingFavorites = await this.favoriteRepo.find({
      where: whereClauses,
      select: ['userId'],
    });

    const candidateUserIds = [
      ...new Set(matchingFavorites.map((f) => f.userId)),
    ];
    if (candidateUserIds.length === 0) return;

    // On ne pousse que les utilisateurs qui ont activé les notifications ET
    // ont un favori sur une ligne perturbée.
    const users = await this.userRepo.find({
      where: { id: In(candidateUserIds), notificationsEnabled: true },
      select: ['id'],
    });
    if (users.length === 0) return;

    const notifications: Notification[] = [];
    const dedupWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const alert of alerts) {
      const type = this.alertType(alert);
      const relatedLine = alert.affectedRoutes[0] ?? null;
      const title = alert.headerText;
      const message = alert.descriptionText || alert.headerText;
      const actionUrl = relatedLine
        ? `/line/${encodeURIComponent(relatedLine)}`
        : '/notifications';

      for (const user of users) {
        const existing = await this.notifRepo.findOne({
          where: {
            userId: user.id,
            externalAlertId: alert.id,
            createdAt: MoreThan(dedupWindow),
          },
        });
        if (existing) continue;

        notifications.push(
          this.notifRepo.create({
            userId: user.id,
            type,
            title,
            message,
            relatedLine,
            actionUrl,
            externalAlertId: alert.id,
            isRead: false,
          }),
        );
      }
    }

    if (notifications.length === 0) return;

    await this.notifRepo.save(notifications, { chunk: 500 });

    // Push asynchrone : un seul message par utilisateur concerné, le détail est in-app.
    const notifiedUserIds = [...new Set(notifications.map((n) => n.userId))];
    await Promise.all(
      notifiedUserIds.map((userId) =>
        this.pushService.sendToUser(userId, {
          title: 'UrbanFlow — Alerte trafic',
          body: `${alerts.length} nouvelle(s) perturbation(s) détectée(s) sur vos lignes.`,
          actionUrl: '/notifications',
        }),
      ),
    );

    // ─── Notifications par trajet favori perturbé ─────────────────────
    const journeyFavorites = await this.favoriteRepo.find({
      where: {
        userId: In(notifiedUserIds),
        type: 'journey',
      },
    });

    const disruptionEmitted = new Set<string>();
    for (const alert of alerts) {
      for (const fav of journeyFavorites) {
        if (
          alert.affectedRoutes.some((route) =>
            this.lineMatchesRoute(fav.mode, route),
          )
        ) {
          const key = `${fav.userId}|${fav.id}|${alert.id}`;
          if (disruptionEmitted.has(key)) continue;
          disruptionEmitted.add(key);
          this.eventEmitter.emit(
            'journey.disruption',
            new JourneyDisruptionEvent(
              fav.userId,
              fav.id,
              fav.mode,
              fav.from || 'Départ',
              fav.to || 'Arrivée',
              alert.severity === 'warning'
                ? 10
                : alert.severity === 'severe'
                  ? 20
                  : 0,
              alert.descriptionText || alert.headerText,
            ),
          );
        }
      }
    }

    this.logger.log(
      `Created ${notifications.length} in-app alert notifications, pushed ${notifiedUserIds.length} users, ${disruptionEmitted.size} journey disruptions`,
    );
  }

  @OnEvent('broadcast.notification', { async: true })
  async handleBroadcast({
    title,
    message,
    type,
    lineId,
  }: BroadcastNotificationEvent): Promise<void> {
    const users = await this.userRepo.find({
      where: { notificationsEnabled: true },
      select: ['id'],
    });
    if (users.length === 0) return;

    const notifications = users.map((user) =>
      this.notifRepo.create({
        userId: user.id,
        type,
        title,
        message,
        relatedLine: lineId || null,
        actionUrl: lineId
          ? `/line/${encodeURIComponent(lineId)}`
          : '/notifications',
        isRead: false,
      }),
    );

    await this.notifRepo.save(notifications, { chunk: 500 });

    await Promise.all(
      users.map((user) =>
        this.pushService.sendToUser(user.id, {
          title,
          body: message,
          actionUrl: lineId
            ? `/line/${encodeURIComponent(lineId)}`
            : '/notifications',
        }),
      ),
    );

    this.logger.log(
      `Broadcast "${title}" to ${users.length} user(s) with push`,
    );
  }

  @OnEvent('departure.reminder', { async: true })
  async handleDepartureReminder({
    userId,
    journeyId,
    lineName,
    from,
    to,
  }: DepartureReminderEvent): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId, notificationsEnabled: true },
      select: ['id'],
    });
    if (!user) return;

    const title = `UrbanFlow — Départ dans 15 min`;
    const body = `${lineName} : ${from} → ${to}`;
    const actionUrl = `/trip/${journeyId}`;

    await this.notifRepo.save(
      this.notifRepo.create({
        userId,
        type: 'favorite_alert',
        title,
        message: body,
        actionUrl,
        isRead: false,
      }),
    );

    await this.pushService.sendToUser(userId, {
      title,
      body,
      actionUrl,
    });

    this.logger.log(`Departure reminder sent to user ${userId}`);
  }

  @OnEvent('journey.disruption', { async: true })
  async handleJourneyDisruption({
    userId,
    journeyId,
    lineName,
    from,
    to,
    delayMinutes,
    message,
  }: JourneyDisruptionEvent): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId, notificationsEnabled: true },
      select: ['id'],
    });
    if (!user) return;

    const title =
      delayMinutes > 0
        ? `UrbanFlow — Retard ${lineName}`
        : `UrbanFlow — Perturbation ${lineName}`;
    const body =
      delayMinutes > 0
        ? `Retard de ${delayMinutes} min sur ${lineName} (${from} → ${to})`
        : message;
    const actionUrl = `/trip/${journeyId}`;

    await this.notifRepo.save(
      this.notifRepo.create({
        userId,
        type: 'delay',
        title,
        message: body,
        actionUrl,
        isRead: false,
      }),
    );

    await this.pushService.sendToUser(userId, {
      title,
      body,
      actionUrl,
    });

    this.logger.log(`Journey disruption sent to user ${userId}`);
  }

  @OnEvent('weekly.digest', { async: true })
  async handleWeeklyDigest({ userId }: WeeklyDigestEvent): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId, notificationsEnabled: true },
      select: ['id'],
    });
    if (!user) return;

    const title = 'UrbanFlow — Votre récap de la semaine';
    const body =
      'Retrouvez vos trajets, vos économies CO₂ et les alertes de la semaine.';
    const actionUrl = '/profile';

    await this.notifRepo.save(
      this.notifRepo.create({
        userId,
        type: 'info',
        title,
        message: body,
        actionUrl,
        isRead: false,
      }),
    );

    await this.pushService.sendToUser(userId, {
      title,
      body,
      actionUrl,
    });

    this.logger.log(`Weekly digest sent to user ${userId}`);
  }

  private lineMatchesRoute(lineName: string, route: string): boolean {
    if (!lineName || !route) return false;
    const a = lineName.toLowerCase().replace(/[-_]/g, ' ').trim();
    const b = route.toLowerCase().replace(/[-_]/g, ' ').trim();
    return a.includes(b) || b.includes(a);
  }

  private alertType(
    alert: AlertInfo,
  ): 'disruption' | 'delay' | 'info' | 'favorite_alert' | 'system' {
    switch (alert.severity) {
      case 'severe':
        return 'disruption';
      case 'warning':
        return 'delay';
      default:
        return 'info';
    }
  }
}
