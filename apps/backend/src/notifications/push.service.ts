import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from './push-subscription.entity';
import { SubscribePushDto } from './notifications.dto';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  actionUrl?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private readonly pushRepo: Repository<PushSubscription>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>(
      'VAPID_SUBJECT',
      'mailto:contact@urbanflow.app',
    );

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY missing — push notifications disabled. Generate keys with: npx web-push generate-vapid-keys',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.logger.log('VAPID details configured for web push');
  }

  /** Enregistre ou met à jour une souscription push pour un utilisateur. */
  async subscribe(
    userId: string,
    dto: SubscribePushDto,
  ): Promise<{ success: boolean; updated: boolean }> {
    const existing = await this.pushRepo.findOne({
      where: { endpoint: dto.endpoint },
    });

    if (existing) {
      existing.userId = userId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      await this.pushRepo.save(existing);
      return { success: true, updated: true };
    }

    const sub = this.pushRepo.create({
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    });
    await this.pushRepo.save(sub);
    return { success: true, updated: false };
  }

  /** Supprime une souscription push appartenant à l'utilisateur. */
  async unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    const result = await this.pushRepo.delete({ userId, endpoint });
    return (result.affected ?? 0) > 0;
  }

  /** Supprime toutes les souscriptions d'un utilisateur (RGPD / account deletion). */
  async removeAllForUser(userId: string): Promise<void> {
    await this.pushRepo.delete({ userId });
  }

  /** Envoie une notification push à tous les appareils d'un utilisateur. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      this.logger.warn('Skipping push send — VAPID keys not configured');
      return;
    }

    const subs = await this.pushRepo.find({ where: { userId } });
    if (subs.length === 0) return;

    await Promise.all(
      subs.map(async (sub) => {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(
            pushSub,
            JSON.stringify({
              ...payload,
              icon:
                payload.icon ?? '/assets/urbanflow/app-icons/pwa-icon-192.png',
              badge:
                payload.badge ??
                '/assets/urbanflow/app-icons/pwa-icon-maskable-512.png',
            }),
          );
        } catch (error: unknown) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            this.logger.log(`Removing expired push subscription (${status})`);
            await this.pushRepo.remove(sub);
          } else {
            this.logger.error(
              `Push send failed for subscription ${sub.id}: ${(error as Error).message}`,
            );
          }
        }
      }),
    );
  }
}
