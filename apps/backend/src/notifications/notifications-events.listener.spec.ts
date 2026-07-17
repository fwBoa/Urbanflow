import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository, In } from 'typeorm';
import { NotificationsEventsListener } from './notifications-events.listener';
import { PushService } from './push.service';
import { Notification } from './notification.entity';
import { User } from '../auth/user.entity';
import { Favorite } from '../favorites/favorite.entity';
import {
  AlertsUpdatedEvent,
  BroadcastNotificationEvent,
  DepartureReminderEvent,
  JourneyDisruptionEvent,
  WeeklyDigestEvent,
} from './events';

describe('NotificationsEventsListener', () => {
  let listener: NotificationsEventsListener;
  let userRepo: Repository<User>;
  let notifRepo: Repository<Notification>;
  let favoriteRepo: Repository<Favorite>;
  let pushService: PushService;
  let eventEmitter: EventEmitter2;

  const users = [{ id: 'user-1' }, { id: 'user-2' }] as User[];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsEventsListener,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue(users),
            findOne: jest.fn().mockImplementation((options: any) => {
              const id = options?.where?.id;
              return Promise.resolve(users.find((u) => u.id === id) ?? null);
            }),
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
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
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
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleAlertsUpdated', () => {
    it('creates in-app notifications and sends push for matching favorites', async () => {
      (favoriteRepo.find as jest.Mock).mockImplementation((options: any) => {
        if (options?.where?.type === 'journey') {
          return Promise.resolve([
            {
              userId: 'user-1',
              id: 'fav-1',
              mode: 'M1',
              type: 'journey',
              from: 'A',
              to: 'B',
            },
          ]);
        }
        return Promise.resolve([
          { userId: 'user-1', mode: 'M1' },
          { userId: 'user-2', mode: 'M1' },
        ]);
      });

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
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'journey.disruption',
        expect.any(JourneyDisruptionEvent),
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

    it('matches line favorites by stable lineId', async () => {
      (favoriteRepo.find as jest.Mock).mockImplementation((options: any) => {
        if (options?.where?.type === 'journey') return Promise.resolve([]);
        return Promise.resolve([
          { userId: 'user-1', type: 'line', lineId: 'RERA' },
        ]);
      });

      const event = new AlertsUpdatedEvent([
        {
          id: 'alert-rer',
          headerText: 'Perturbation RER A',
          severity: 'warning',
          affectedRoutes: ['RER A'],
          lineId: 'RERA',
          activePeriod: [{ start: new Date().toISOString(), end: '' }],
        },
      ]);

      await listener.handleAlertsUpdated(event);

      expect(favoriteRepo.find).toHaveBeenCalled();
      expect(userRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: In(['user-1']),
            notificationsEnabled: true,
          }),
        }),
      );
      expect(notifRepo.create).toHaveBeenCalled();
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

  describe('handleDepartureReminder', () => {
    it('persists notification and pushes when user enabled', async () => {
      const event = new DepartureReminderEvent(
        'user-1',
        'fav-1',
        'M1',
        'A',
        'B',
        new Date().toISOString(),
      );

      await listener.handleDepartureReminder(event);

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'favorite_alert',
          actionUrl: '/trip/fav-1',
        }),
      );
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ title: 'UrbanFlow — Départ dans 15 min' }),
      );
    });

    it('does nothing when user has disabled notifications', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);

      const event = new DepartureReminderEvent(
        'user-1',
        'fav-1',
        'M1',
        'A',
        'B',
        new Date().toISOString(),
      );

      await listener.handleDepartureReminder(event);

      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('handleJourneyDisruption', () => {
    it('persists delay notification and pushes when delay > 0', async () => {
      const event = new JourneyDisruptionEvent(
        'user-1',
        'fav-1',
        'M1',
        'A',
        'B',
        12,
        'Panne signalée',
      );

      await listener.handleJourneyDisruption(event);

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'delay',
          actionUrl: '/trip/fav-1',
        }),
      );
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ body: expect.stringContaining('12 min') }),
      );
    });

    it('uses message body when no delay', async () => {
      const event = new JourneyDisruptionEvent(
        'user-1',
        'fav-1',
        'M1',
        'A',
        'B',
        0,
        'Incident terminé',
      );

      await listener.handleJourneyDisruption(event);

      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ body: 'Incident terminé' }),
      );
    });

    it('does nothing when user has disabled notifications', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);

      const event = new JourneyDisruptionEvent(
        'user-1',
        'fav-1',
        'M1',
        'A',
        'B',
        5,
        'Panne',
      );

      await listener.handleJourneyDisruption(event);

      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('handleWeeklyDigest', () => {
    it('persists weekly digest and pushes to enabled user', async () => {
      const event = new WeeklyDigestEvent('user-1');

      await listener.handleWeeklyDigest(event);

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'info',
          actionUrl: '/profile',
        }),
      );
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          title: 'UrbanFlow — Votre récap de la semaine',
        }),
      );
    });

    it('does nothing when user has disabled notifications', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);

      const event = new WeeklyDigestEvent('user-1');

      await listener.handleWeeklyDigest(event);

      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(pushService.sendToUser).not.toHaveBeenCalled();
    });
  });
});
