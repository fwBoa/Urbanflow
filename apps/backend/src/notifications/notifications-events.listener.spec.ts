import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { NotificationsEventsListener } from './notifications-events.listener';
import { PushService } from './push.service';
import { Notification } from './notification.entity';
import { User } from '../auth/user.entity';
import { Favorite } from '../favorites/favorite.entity';
import { AlertsUpdatedEvent, BroadcastNotificationEvent } from './events';

describe('NotificationsEventsListener', () => {
  let listener: NotificationsEventsListener;
  let userRepo: Repository<User>;
  let notifRepo: Repository<Notification>;
  let favoriteRepo: Repository<Favorite>;
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
          provide: getRepositoryToken(Favorite),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
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
    favoriteRepo = module.get<Repository<Favorite>>(
      getRepositoryToken(Favorite),
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
    it('creates in-app notifications and sends push for matching favorites', async () => {
      (favoriteRepo.find as jest.Mock).mockResolvedValue([
        { userId: 'user-1', mode: 'M1' },
        { userId: 'user-2', mode: 'M1' },
      ]);

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

      expect(favoriteRepo.find).toHaveBeenCalled();
      expect(userRepo.find).toHaveBeenCalledWith({
        where: { id: In(['user-1', 'user-2']), notificationsEnabled: true },
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

    it('skips users without matching favorites', async () => {
      (favoriteRepo.find as jest.Mock).mockResolvedValue([]);

      const event = new AlertsUpdatedEvent([
        {
          id: 'alert-1',
          headerText: 'Perturbation M1',
          severity: 'severe',
          affectedRoutes: ['M1'],
          activePeriod: [{ start: new Date().toISOString(), end: '' }],
        },
      ]);

      await listener.handleAlertsUpdated(event);

      expect(userRepo.find).not.toHaveBeenCalled();
      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('skips duplicate alerts within the dedup window', async () => {
      (favoriteRepo.find as jest.Mock).mockResolvedValue([
        { userId: 'user-1', mode: 'M1' },
        { userId: 'user-2', mode: 'M1' },
      ]);
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
      (favoriteRepo.find as jest.Mock).mockResolvedValue([
        { userId: 'user-1', mode: 'M1' },
      ]);
      (userRepo.find as jest.Mock).mockResolvedValue([]);

      const event = new AlertsUpdatedEvent([
        {
          id: 'alert-1',
          headerText: 'Info',
          severity: 'info',
          affectedRoutes: ['M1'],
          activePeriod: [{ start: new Date().toISOString(), end: '' }],
        },
      ]);

      await listener.handleAlertsUpdated(event);

      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });

    it('does nothing when alert has no affected routes', async () => {
      const event = new AlertsUpdatedEvent([
        {
          id: 'alert-1',
          headerText: 'Info générale',
          severity: 'info',
          affectedRoutes: [],
          activePeriod: [{ start: new Date().toISOString(), end: '' }],
        },
      ]);

      await listener.handleAlertsUpdated(event);

      expect(favoriteRepo.find).not.toHaveBeenCalled();
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
