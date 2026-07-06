import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsEventsListener } from './notifications-events.listener';
import { PushService } from './push.service';
import { Notification } from './notification.entity';
import { User } from '../auth/user.entity';
import { AlertsUpdatedEvent, BroadcastNotificationEvent } from './events';

describe('NotificationsEventsListener', () => {
  let listener: NotificationsEventsListener;
  let userRepo: Repository<User>;
  let notifRepo: Repository<Notification>;
  let pushService: PushService;

  const users = [{ id: 'user-1' }, { id: 'user-2' }] as User[];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsEventsListener,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue(users),
          },
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest
              .fn()
              .mockImplementation((data) => data as Notification),
            save: jest
              .fn()
              .mockImplementation((data) =>
                Array.isArray(data) ? data : [data],
              ),
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

    listener = module.get<NotificationsEventsListener>(
      NotificationsEventsListener,
    );
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    notifRepo = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
    pushService = module.get<PushService>(PushService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleAlertsUpdated', () => {
    it('creates in-app notifications and sends push for new alerts', async () => {
      const event = new AlertsUpdatedEvent([
        {
          id: 'alert-1',
          headerText: 'Perturbation M1',
          descriptionText: 'Traffic ralenti sur la ligne 1',
          severity: 'severe',
          affectedRoutes: ['M1'],
          activePeriod: [{ start: new Date().toISOString(), end: '' }],
        },
      ]);

      await listener.handleAlertsUpdated(event);

      expect(userRepo.find).toHaveBeenCalledWith({
        where: { notificationsEnabled: true },
        select: ['id'],
      });
      expect(notifRepo.create).toHaveBeenCalledTimes(2);
      expect(notifRepo.save).toHaveBeenCalled();
      expect(pushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          title: 'UrbanFlow — Alerte trafic',
          actionUrl: '/notifications',
        }),
      );
    });

    it('skips duplicate alerts within the dedup window', async () => {
      (notifRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'existing',
      });

      const event = new AlertsUpdatedEvent([
        {
          id: 'alert-1',
          headerText: 'Perturbation M1',
          severity: 'warning',
          affectedRoutes: ['M1'],
          activePeriod: [{ start: new Date().toISOString(), end: '' }],
        },
      ]);

      await listener.handleAlertsUpdated(event);

      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
      expect(notifRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ externalAlertId: 'alert-1' }),
        }),
      );
    });

    it('does nothing when no users have notifications enabled', async () => {
      (userRepo.find as jest.Mock).mockResolvedValue([]);

      const event = new AlertsUpdatedEvent([
        {
          id: 'alert-1',
          headerText: 'Info',
          severity: 'info',
          affectedRoutes: [],
          activePeriod: [{ start: new Date().toISOString(), end: '' }],
        },
      ]);

      await listener.handleAlertsUpdated(event);

      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('handleBroadcast', () => {
    it('creates notifications and pushes for admin broadcast', async () => {
      const event = new BroadcastNotificationEvent(
        'Maintenance',
        'Service indisponible ce soir',
        'system',
      );

      await listener.handleBroadcast(event);

      expect(notifRepo.create).toHaveBeenCalledTimes(2);
      expect(notifRepo.save).toHaveBeenCalled();
      expect(pushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          title: 'Maintenance',
          body: 'Service indisponible ce soir',
          actionUrl: '/notifications',
        }),
      );
    });
  });
});
