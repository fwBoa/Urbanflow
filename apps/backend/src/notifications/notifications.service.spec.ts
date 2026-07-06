import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.entity';
import { PushService } from './push.service';
import { CreateNotificationDto } from './notifications.dto';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: Repository<Notification>;
  let pushService: PushService;

  const mockNotification: Notification = {
    id: 'notif-1',
    userId: 'user-1',
    type: 'disruption',
    title: 'Alerte',
    message: 'Perturbation sur la ligne M1',
    isRead: false,
    relatedLine: 'M1',
    relatedStop: null,
    actionUrl: null,
    createdAt: new Date(),
    user: undefined as any,
  };

  const createDto: CreateNotificationDto = {
    userId: 'user-1',
    type: 'info',
    title: 'Info',
    message: 'Message',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            find: jest.fn().mockResolvedValue([mockNotification]),
            findOne: jest.fn().mockResolvedValue(mockNotification),
            count: jest.fn().mockResolvedValue(2),
            create: jest.fn().mockReturnValue(mockNotification),
            save: jest.fn().mockResolvedValue(mockNotification),
            update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
            delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
          },
        },
        {
          provide: PushService,
          useValue: {
            sendToUser: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repo = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
    pushService = module.get<PushService>(PushService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getNotifications', () => {
    it('returns notifications ordered by createdAt DESC', async () => {
      const result = await service.getNotifications('user-1');
      expect(result).toEqual([mockNotification]);
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of unread notifications', async () => {
      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(2);
      expect(repo.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });
  });

  describe('create', () => {
    it('creates and saves a notification', async () => {
      const result = await service.create(createDto);
      expect(result).toEqual(mockNotification);
      expect(repo.create).toHaveBeenCalledWith(createDto);
      expect(repo.save).toHaveBeenCalledWith(mockNotification);
    });
  });

  describe('markAsRead', () => {
    it('marks a notification as read when found', async () => {
      const saved = { ...mockNotification, isRead: true } as Notification;
      jest.spyOn(repo, 'findOne').mockResolvedValue(mockNotification);
      jest.spyOn(repo, 'save').mockResolvedValue(saved);
      const result = await service.markAsRead('notif-1', 'user-1');
      expect(result).toEqual(saved);
      expect(mockNotification.isRead).toBe(true);
      expect(repo.save).toHaveBeenCalledWith(mockNotification);
    });

    it('returns null when notification not found', async () => {
      jest.spyOn(repo, 'findOne').mockResolvedValue(null);
      const result = await service.markAsRead('notif-1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('updates all unread notifications for a user', async () => {
      await service.markAllAsRead('user-1');
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-1', isRead: false },
        { isRead: true },
      );
    });
  });

  describe('remove', () => {
    it('returns true when notification is deleted', async () => {
      jest.spyOn(repo, 'delete').mockResolvedValue({ affected: 1, raw: [] });
      const result = await service.remove('notif-1', 'user-1');
      expect(result).toBe(true);
      expect(repo.delete).toHaveBeenCalledWith({
        id: 'notif-1',
        userId: 'user-1',
      });
    });

    it('returns false when no notification deleted', async () => {
      jest.spyOn(repo, 'delete').mockResolvedValue({ affected: 0, raw: [] });
      const result = await service.remove('notif-1', 'user-1');
      expect(result).toBe(false);
    });
  });

  describe('removeAllForUser', () => {
    it('deletes all notifications for a user', async () => {
      await service.removeAllForUser('user-1');
      expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });

  describe('exportForUser', () => {
    it('returns all notifications for RGPD export', async () => {
      const result = await service.exportForUser('user-1');
      expect(result).toEqual([mockNotification]);
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('notifyUsersForLine', () => {
    it('creates notifications and sends push to each user', async () => {
      const userIds = ['user-1', 'user-2'];
      jest
        .spyOn(repo, 'create')
        .mockImplementation((dto: any) => dto as Notification);
      jest.spyOn(repo, 'save').mockResolvedValue(mockNotification);

      await service.notifyUsersForLine(
        'M1',
        'disruption',
        'Titre',
        'Message',
        userIds,
      );

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            type: 'disruption',
            title: 'Titre',
            message: 'Message',
            relatedLine: 'M1',
          }),
          expect.objectContaining({
            userId: 'user-2',
            type: 'disruption',
            title: 'Titre',
            message: 'Message',
            relatedLine: 'M1',
          }),
        ]),
      );
      expect(pushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(pushService.sendToUser).toHaveBeenCalledWith('user-1', {
        title: 'Titre',
        body: 'Message',
        actionUrl: '/line/M1',
      });
      expect(pushService.sendToUser).toHaveBeenCalledWith('user-2', {
        title: 'Titre',
        body: 'Message',
        actionUrl: '/line/M1',
      });
    });
  });
});
