import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminService } from './admin.service';
import { User } from '../auth/user.entity';
import { History } from '../favorites/history.entity';
import { Notification } from '../notifications/notification.entity';
import { GtfsParserService } from '../transport/gtfs-parser.service';
import { PrimService } from '../transport/prim.service';
import { BroadcastNotificationEvent } from '../notifications/events';

describe('AdminService', () => {
  let service: AdminService;
  let userRepo: Repository<User>;
  let historyRepo: Repository<History>;
  let notifRepo: Repository<Notification>;
  let gtfsParser: GtfsParserService;
  let eventEmitter: EventEmitter2;

  const mockUser: Partial<User> = {
    id: 'user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'user',
    createdAt: new Date(),
    lastLoginAt: new Date(),
    consentGeoloc: true,
    consentHistory: true,
  };

  const mockGtfsParserService = {
    downloadAndLoad: jest.fn().mockResolvedValue(undefined),
    isLoaded: jest.fn().mockReturnValue(true),
    getLastLoadTime: jest.fn().mockReturnValue(new Date()),
    getStats: jest.fn().mockReturnValue({ stops: 100, routes: 50 }),
  };

  const mockPrimService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            softDelete: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getRawMany: jest
                .fn()
                .mockResolvedValue([{ role: 'user', count: '10' }]),
              getRawOne: jest.fn().mockResolvedValue({ total: '5000' }),
              getCount: jest.fn().mockResolvedValue(5),
            })),
          },
        },
        {
          provide: getRepositoryToken(History),
          useValue: {
            count: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getRawMany: jest
                .fn()
                .mockResolvedValue([{ mode: 'metro', count: '20' }]),
              getRawOne: jest.fn().mockResolvedValue({ total: '5000' }),
              getCount: jest.fn().mockResolvedValue(10),
            })),
          },
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: GtfsParserService,
          useValue: mockGtfsParserService,
        },
        {
          provide: PrimService,
          useValue: mockPrimService,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    historyRepo = module.get<Repository<History>>(getRepositoryToken(History));
    notifRepo = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
    gtfsParser = module.get<GtfsParserService>(GtfsParserService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      const qb = userRepo.createQueryBuilder('user');
      (qb.getRawMany as jest.Mock).mockResolvedValue([
        { role: 'user', count: '10' },
      ]);

      const histQb = historyRepo.createQueryBuilder('history');
      (histQb.getRawMany as jest.Mock).mockResolvedValue([
        { mode: 'metro', count: '20' },
      ]);
      (histQb.getRawOne as jest.Mock).mockResolvedValue({ total: '5000' });

      (qb.getCount as jest.Mock).mockResolvedValue(3);
      (histQb.getCount as jest.Mock).mockResolvedValue(10);

      (userRepo.count as jest.Mock).mockResolvedValue(50);
      (historyRepo.count as jest.Mock).mockResolvedValue(200);
      (notifRepo.count as jest.Mock).mockResolvedValue(30);

      const result = await service.getDashboardStats();

      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('activity');
      expect(result.totals).toHaveProperty('users', 50);
      expect(result.totals).toHaveProperty('trips', 200);
      expect(result.totals).toHaveProperty('notifications', 30);
    });
  });

  describe('getAllUsers', () => {
    it('should return all users with selected fields', async () => {
      const users = [mockUser as User];
      (userRepo.find as jest.Mock).mockResolvedValue(users);

      const result = await service.getAllUsers();

      expect(userRepo.find).toHaveBeenCalledWith({
        select: expect.arrayContaining(['id', 'email', 'displayName', 'role']),
        withDeleted: true,
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(users);
    });
  });

  describe('getUserById', () => {
    it('should return user with trip and notification counts', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(mockUser);
      (historyRepo.count as jest.Mock).mockResolvedValue(5);
      (notifRepo.count as jest.Mock).mockResolvedValue(3);

      const result = await service.getUserById('user-123');

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        withDeleted: true,
      });
      expect(result).toHaveProperty('tripCount', 5);
      expect(result).toHaveProperty('notifCount', 3);
    });

    it('should return null if user not found', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getUserById('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(mockUser);
      (userRepo.softDelete as jest.Mock).mockResolvedValue({ affected: 1 });

      const result = await service.deleteUser('user-123');

      expect(userRepo.softDelete).toHaveBeenCalledWith('user-123');
      expect(result).toHaveProperty(
        'message',
        'Utilisateur supprimé (soft delete)',
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteUser('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllTrips', () => {
    it('should return paginated trips', async () => {
      const trips = [{ id: 'trip-1', from: 'A', to: 'B' }] as History[];
      (historyRepo.findAndCount as jest.Mock).mockResolvedValue([trips, 100]);

      const result = await service.getAllTrips(50, 0);

      expect(historyRepo.findAndCount).toHaveBeenCalledWith({
        take: 50,
        skip: 0,
        order: { tripDate: 'DESC' },
        relations: ['user'],
      });
      expect(result.data).toEqual(trips);
      expect(result.total).toBe(100);
    });
  });

  describe('getAllNotifications', () => {
    it('should return all notifications', async () => {
      const notifications = [
        { id: 'notif-1', title: 'Alert' },
      ] as Notification[];
      (notifRepo.find as jest.Mock).mockResolvedValue(notifications);

      const result = await service.getAllNotifications();

      expect(notifRepo.find).toHaveBeenCalledWith({
        take: 100,
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(notifications);
    });
  });

  describe('broadcastNotification', () => {
    it('should emit broadcast.notification event for enabled users', async () => {
      const users = [{ id: 'user-1' }, { id: 'user-2' }] as User[];
      (userRepo.find as jest.Mock).mockResolvedValue(users);

      const body = {
        title: 'Alert',
        message: 'Test',
        type: 'info',
        lineId: 'metro-1',
      };
      const result = await service.broadcastNotification(body);

      expect(userRepo.find).toHaveBeenCalledWith({
        where: { notificationsEnabled: true },
        select: ['id'],
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'broadcast.notification',
        new BroadcastNotificationEvent(
          body.title,
          body.message,
          body.type as
            | 'disruption'
            | 'delay'
            | 'info'
            | 'favorite_alert'
            | 'system',
          body.lineId,
        ),
      );
      expect(result).toBe(2);
    });
  });

  describe('reloadGtfs', () => {
    it('should reload GTFS data and return status', async () => {
      const result = await service.reloadGtfs();

      expect(gtfsParser.downloadAndLoad).toHaveBeenCalled();
      expect(result).toHaveProperty('loaded', true);
      expect(result).toHaveProperty('lastLoadTime');
      expect(result).toHaveProperty('stats');
    });
  });

  describe('getGtfsStatus', () => {
    it('should return current GTFS status', async () => {
      const result = await service.getGtfsStatus();

      expect(result).toHaveProperty('loaded', true);
      expect(result).toHaveProperty('lastLoadTime');
      expect(result).toHaveProperty('stats');
    });
  });
});
