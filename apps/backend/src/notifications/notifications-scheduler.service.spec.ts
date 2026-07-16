import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { NotificationsSchedulerService } from './notifications-scheduler.service';
import { Favorite } from '../favorites/favorite.entity';
import { User } from '../auth/user.entity';
import { DepartureReminderEvent, WeeklyDigestEvent } from './events';

describe('NotificationsSchedulerService', () => {
  let service: NotificationsSchedulerService;
  let favoriteRepo: Repository<Favorite>;
  let userRepo: Repository<User>;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsSchedulerService,
        {
          provide: getRepositoryToken(Favorite),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
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

    service = module.get<NotificationsSchedulerService>(
      NotificationsSchedulerService,
    );
    favoriteRepo = module.get<Repository<Favorite>>(
      getRepositoryToken(Favorite),
    );
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendDepartureReminders', () => {
    it('emits a reminder for each journey favorite in the 10-20 min window', async () => {
      // departure = createdAt + 1h, donc createdAt = now - 49 min donne un départ dans 11 min.
      const createdAt = new Date(Date.now() - 49 * 60 * 1000);
      (favoriteRepo.find as jest.Mock).mockResolvedValue([
        {
          userId: 'user-1',
          id: 'fav-1',
          mode: 'M1',
          type: 'journey',
          from: 'A',
          to: 'B',
          createdAt,
        },
        {
          userId: 'user-2',
          id: 'fav-2',
          mode: 'RER A',
          type: 'journey',
          from: 'C',
          to: 'D',
          createdAt,
        },
      ]);

      await service.sendDepartureReminders();

      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'departure.reminder',
        expect.any(DepartureReminderEvent),
      );
    });

    it('skips journey favorites outside the reminder window', async () => {
      const createdAt = new Date(); // departure = +1h => way outside 10-20 min
      (favoriteRepo.find as jest.Mock).mockResolvedValue([
        {
          userId: 'user-1',
          id: 'fav-1',
          mode: 'M1',
          type: 'journey',
          from: 'A',
          to: 'B',
          createdAt,
        },
      ]);

      await service.sendDepartureReminders();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not duplicate reminders for the same favorite and minute', async () => {
      const createdAt = new Date(Date.now() - 49 * 60 * 1000);
      (favoriteRepo.find as jest.Mock).mockResolvedValue([
        {
          userId: 'user-1',
          id: 'fav-1',
          mode: 'M1',
          type: 'journey',
          from: 'A',
          to: 'B',
          createdAt,
        },
        {
          userId: 'user-1',
          id: 'fav-1',
          mode: 'M1',
          type: 'journey',
          from: 'A',
          to: 'B',
          createdAt,
        },
      ]);

      await service.sendDepartureReminders();

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendWeeklyDigests', () => {
    it('emits a weekly digest for each enabled user', async () => {
      (userRepo.find as jest.Mock).mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);

      await service.sendWeeklyDigests();

      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'weekly.digest',
        expect.any(WeeklyDigestEvent),
      );
    });

    it('does nothing when no users have notifications enabled', async () => {
      (userRepo.find as jest.Mock).mockResolvedValue([]);

      await service.sendWeeklyDigests();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
