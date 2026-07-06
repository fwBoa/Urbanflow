import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { CreateNotificationDto } from './notifications.dto';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly pushService: PushService,
  ) {}

  /** Get all notifications for a user, newest first */
  async getNotifications(userId: string): Promise<Notification[]> {
    return this.notifRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Get unread count for a user */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({ where: { userId, isRead: false } });
  }

  /** Create a notification */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notif = this.notifRepo.create(dto);
    return this.notifRepo.save(notif);
  }

  /** Mark a single notification as read */
  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notif = await this.notifRepo.findOne({ where: { id, userId } });
    if (!notif) return null;
    notif.isRead = true;
    return this.notifRepo.save(notif);
  }

  /** Mark all notifications as read for a user */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notifRepo.update({ userId, isRead: false }, { isRead: true });
  }

  /** Delete a notification */
  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.notifRepo.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  /** Delete all notifications for a user (RGPD) */
  async removeAllForUser(userId: string): Promise<void> {
    await this.notifRepo.delete({ userId });
  }

  /** Export notifications for RGPD data export */
  async exportForUser(userId: string): Promise<Notification[]> {
    return this.notifRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Create disruption alerts for users whose favorites match a given line.
   * Called by the GTFS-RT watcher when a disruption is detected.
   */
  async notifyUsersForLine(
    lineId: string,
    type: 'disruption' | 'delay',
    title: string,
    message: string,
    userIds: string[],
  ): Promise<void> {
    const notifications = userIds.map((userId) =>
      this.notifRepo.create({
        userId,
        type,
        title,
        message,
        relatedLine: lineId,
      }),
    );
    await this.notifRepo.save(notifications);

    // Envoyes web push en parallèle sans bloquer la transaction in-app.
    await Promise.all(
      userIds.map((userId) =>
        this.pushService.sendToUser(userId, {
          title,
          body: message,
          actionUrl: `/line/${lineId}`,
        }),
      ),
    );
  }
}