import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from '../auth/user.entity';
import { Notification } from './notification.entity';
import { PushService } from './push.service';
import {
  AlertsUpdatedEvent,
  AlertInfo,
  BroadcastNotificationEvent,
} from './events';

/**
 * Consommateur d'événements métier pour les notifications.
 *
 * À chaque événement `alerts.updated` ou `broadcast.notification`, on :
 *  1. Persiste une notification in-app par utilisateur concerné (dédoublonnage
 *     via `externalAlertId` sur 24 h).
 *  2. Envoie une notification push asynchrone aux utilisateurs abonnés.
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
    private readonly pushService: PushService,
  ) {}

  @OnEvent('alerts.updated', { async: true })
  async handleAlertsUpdated({ alerts }: AlertsUpdatedEvent): Promise<void> {
    if (alerts.length === 0) return;

    const users = await this.userRepo.find({
      where: { notificationsEnabled: true },
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

    // Push asynchrone : un seul message par utilisateur, le détail est in-app.
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

    this.logger.log(
      `Created ${notifications.length} in-app alert notifications and pushed ${notifiedUserIds.length} users`,
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
