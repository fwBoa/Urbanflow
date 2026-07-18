import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';
import { PushSubscription } from './push-subscription.entity';
import { SubscribePushDto } from './notifications.dto';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

describe('PushService', () => {
  let service: PushService;
  let repo: Repository<PushSubscription>;

  const mockSubscription: SubscribePushDto = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: {
      p256dh: 'p256dh-key',
      auth: 'auth-secret',
    },
  };

  const mockPushSubscription = {
    id: 'sub-1',
    userId: 'user-123',
    endpoint: mockSubscription.endpoint,
    p256dh: mockSubscription.keys.p256dh,
    auth: mockSubscription.keys.auth,
  } as PushSubscription;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        {
          provide: getRepositoryToken(PushSubscription),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockReturnValue(mockPushSubscription),
            save: jest.fn().mockResolvedValue(mockPushSubscription),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const values: Record<string, string> = {
                VAPID_PUBLIC_KEY: 'public-key',
                VAPID_PRIVATE_KEY: 'private-key',
                VAPID_SUBJECT: 'mailto:test@urbanflow.app',
              };
              return values[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    repo = module.get<Repository<PushSubscription>>(
      getRepositoryToken(PushSubscription),
    );

    jest.clearAllMocks();
  });

  it('should configure VAPID details on init', () => {
    service.onModuleInit();
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@urbanflow.app',
      'public-key',
      'private-key',
    );
  });

  it('should warn and skip VAPID config if keys missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        {
          provide: getRepositoryToken(PushSubscription),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    const svc = module.get<PushService>(PushService);
    svc.onModuleInit();
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  describe('subscribe', () => {
    it('creates a new subscription if endpoint does not exist', async () => {
      jest.spyOn(repo, 'findOne').mockResolvedValue(null);
      jest.spyOn(repo, 'create').mockReturnValue(mockPushSubscription);
      jest.spyOn(repo, 'save').mockResolvedValue(mockPushSubscription);

      const result = await service.subscribe('user-123', mockSubscription);

      expect(result).toEqual({ success: true, updated: false });
      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-123',
        endpoint: mockSubscription.endpoint,
        p256dh: mockSubscription.keys.p256dh,
        auth: mockSubscription.keys.auth,
      });
      expect(repo.save).toHaveBeenCalledWith(mockPushSubscription);
    });

    it('updates existing subscription when endpoint already registered', async () => {
      const existing = {
        ...mockPushSubscription,
        userId: 'old-user',
      };
      jest.spyOn(repo, 'findOne').mockResolvedValue(existing);
      jest.spyOn(repo, 'save').mockResolvedValue(existing);

      const result = await service.subscribe('user-123', mockSubscription);

      expect(result).toEqual({ success: true, updated: true });
      expect(existing.userId).toBe('user-123');
      expect(existing.p256dh).toBe(mockSubscription.keys.p256dh);
      expect(repo.save).toHaveBeenCalledWith(existing);
    });
  });

  describe('unsubscribe', () => {
    it('deletes subscription belonging to user and endpoint', async () => {
      jest.spyOn(repo, 'delete').mockResolvedValue({ affected: 1, raw: [] });
      const result = await service.unsubscribe(
        'user-123',
        mockSubscription.endpoint,
      );
      expect(result).toBe(true);
      expect(repo.delete).toHaveBeenCalledWith({
        userId: 'user-123',
        endpoint: mockSubscription.endpoint,
      });
    });

    it('returns false when no subscription deleted', async () => {
      jest.spyOn(repo, 'delete').mockResolvedValue({ affected: 0, raw: [] });
      const result = await service.unsubscribe('user-123', 'other-endpoint');
      expect(result).toBe(false);
    });
  });

  describe('sendToUser', () => {
    it('does nothing when user has no subscriptions', async () => {
      jest.spyOn(repo, 'find').mockResolvedValue([]);
      await service.sendToUser('user-123', { title: 'Test', body: 'Body' });
      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it('sends push to all subscriptions', async () => {
      jest.spyOn(repo, 'find').mockResolvedValue([mockPushSubscription]);
      (webpush.sendNotification as jest.Mock).mockResolvedValue({
        statusCode: 201,
      });

      await service.sendToUser('user-123', { title: 'T', body: 'B' });

      expect(webpush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: mockSubscription.endpoint,
          keys: mockSubscription.keys,
        },
        JSON.stringify({
          title: 'T',
          body: 'B',
          icon: '/assets/urbanflow/app-icons/pwa-icon-192.png',
          badge: '/assets/urbanflow/app-icons/pwa-icon-maskable-512.png',
        }),
      );
    });

    it('removes expired subscriptions (410) and keeps others', async () => {
      const sub2 = {
        ...mockPushSubscription,
        id: 'sub-2',
        endpoint: 'endpoint-2',
      };
      jest.spyOn(repo, 'find').mockResolvedValue([mockPushSubscription, sub2]);
      const removeSpy = jest
        .spyOn(repo, 'remove')
        .mockResolvedValue(mockPushSubscription);

      (webpush.sendNotification as jest.Mock)
        .mockRejectedValueOnce({ statusCode: 410, message: 'Gone' })
        .mockResolvedValueOnce({ statusCode: 201 });

      await service.sendToUser('user-123', { title: 'T', body: 'B' });

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith(mockPushSubscription);
    });
  });
});
