import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { SubscribePushDto, UnsubscribePushDto } from './notifications.dto';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notifService: NotificationsService;
  let pushService: PushService;

  const req = { user: { id: 'user-1' } };

  const mockNotification = {
    id: 'notif-1',
    userId: 'user-1',
    type: 'info',
    title: 'Titre',
    message: 'Message',
    isRead: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            getNotifications: jest.fn().mockResolvedValue([mockNotification]),
            getUnreadCount: jest.fn().mockResolvedValue(2),
            create: jest.fn().mockResolvedValue(mockNotification),
            markAsRead: jest.fn().mockResolvedValue(mockNotification),
            markAllAsRead: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(true),
            removeAllForUser: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PushService,
          useValue: {
            subscribe: jest
              .fn()
              .mockResolvedValue({ success: true, updated: false }),
            unsubscribe: jest.fn().mockResolvedValue(true),
            sendToUser: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    notifService = module.get<NotificationsService>(NotificationsService);
    pushService = module.get<PushService>(PushService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAll', () => {
    it('returns all notifications for current user', async () => {
      const result = await controller.getAll(req);
      expect(result).toEqual([mockNotification]);
      expect(notifService.getNotifications).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread count for current user', async () => {
      const result = await controller.getUnreadCount(req);
      expect(result).toEqual({ count: 2 });
      expect(notifService.getUnreadCount).toHaveBeenCalledWith('user-1');
    });
  });

  describe('markAsRead', () => {
    it('returns notification when found', async () => {
      const result = await controller.markAsRead('notif-1', req);
      expect(result).toEqual(mockNotification);
      expect(notifService.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
    });

    it('returns message when notification not found', async () => {
      jest.spyOn(notifService, 'markAsRead').mockResolvedValue(null);
      const result = await controller.markAsRead('notif-1', req);
      expect(result).toEqual({ message: 'Notification not found' });
    });
  });

  describe('markAllAsRead', () => {
    it('marks all notifications as read', async () => {
      const result = await controller.markAllAsRead(req);
      expect(result).toEqual({
        message: 'All notifications marked as read',
      });
      expect(notifService.markAllAsRead).toHaveBeenCalledWith('user-1');
    });
  });

  describe('remove', () => {
    it('returns deletion status', async () => {
      const result = await controller.remove('notif-1', req);
      expect(result).toEqual({ deleted: true });
      expect(notifService.remove).toHaveBeenCalledWith('notif-1', 'user-1');
    });
  });

  describe('removeAll', () => {
    it('removes all notifications for current user', async () => {
      const result = await controller.removeAll(req);
      expect(result).toEqual({ message: 'All notifications deleted' });
      expect(notifService.removeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('subscribePush', () => {
    it('subscribes current user to push', async () => {
      const dto: SubscribePushDto = {
        endpoint: 'https://fcm.test/123',
        keys: { p256dh: 'key', auth: 'secret' },
      };
      const result = await controller.subscribePush(dto, req);
      expect(result).toEqual({ success: true, updated: false });
      expect(pushService.subscribe).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('unsubscribePush', () => {
    it('unsubscribes current user from push', async () => {
      const dto: UnsubscribePushDto = { endpoint: 'https://fcm.test/123' };
      const result = await controller.unsubscribePush(dto, req);
      expect(result).toEqual({ deleted: true });
      expect(pushService.unsubscribe).toHaveBeenCalledWith(
        'user-1',
        'https://fcm.test/123',
      );
    });
  });

  describe('sendTestPush', () => {
    it('sends a test push to current user', async () => {
      const result = await controller.sendTestPush(req);
      expect(result).toEqual({ message: 'Test push sent' });
      expect(pushService.sendToUser).toHaveBeenCalledWith('user-1', {
        title: 'UrbanFlow — Test',
        body: 'Vos notifications push fonctionnent.',
        actionUrl: '/notifications',
      });
    });
  });
});
