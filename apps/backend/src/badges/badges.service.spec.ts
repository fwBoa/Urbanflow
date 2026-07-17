import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadgesService, type UserBadgeStats } from './badges.service';
import { BadgeUnlock } from './badge.entity';
import { FavoritesService } from '../favorites/favorites.service';
import { HistoryUpdatedEvent } from '../notifications/events';

describe('BadgesService', () => {
  let service: BadgesService;
  let badgeRepo: Repository<BadgeUnlock>;
  let favoritesService: FavoritesService;

  const mockFavoritesService = {
    getStats: jest.fn().mockResolvedValue({
      totalTrips: 5,
      co2Saved: 600,
      favoriteCount: 2,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        {
          provide: getRepositoryToken(BadgeUnlock),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((dto) => dto as BadgeUnlock),
            save: jest.fn().mockImplementation((dto) =>
              Promise.resolve({
                ...dto,
                id: 'badge-1',
                unlockedAt: new Date(),
              }),
            ),
          },
        },
        {
          provide: FavoritesService,
          useValue: mockFavoritesService,
        },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
    badgeRepo = module.get<Repository<BadgeUnlock>>(
      getRepositoryToken(BadgeUnlock),
    );
    favoritesService = module.get<FavoritesService>(FavoritesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('unlockBadges', () => {
    it('persists badges matching current stats', async () => {
      const stats: UserBadgeStats = {
        totalTrips: 5,
        co2Saved: 600,
        favoriteCount: 2,
      };
      const result = await service.unlockBadges('user-1', stats);
      expect(result.length).toBeGreaterThan(0);
      expect(badgeRepo.save).toHaveBeenCalled();
    });

    it('does not duplicate already unlocked badges', async () => {
      jest.spyOn(badgeRepo, 'findOne').mockResolvedValue({
        id: 'badge-1',
        userId: 'user-1',
        badgeKey: 'first_trip',
        unlockedAt: new Date(),
      });

      const stats: UserBadgeStats = {
        totalTrips: 1,
        co2Saved: 0,
        favoriteCount: 0,
      };
      const result = await service.unlockBadges('user-1', stats);
      expect(result).toHaveLength(0);
      expect(badgeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getBadges', () => {
    it('returns unlocked badges from persisted records', async () => {
      jest.spyOn(badgeRepo, 'find').mockResolvedValue([
        {
          id: 'b1',
          userId: 'user-1',
          badgeKey: 'first_trip',
          unlockedAt: new Date(),
        },
      ]);

      const badges = await service.getBadges('user-1');
      const firstTrip = badges.find((b) => b.key === 'first_trip');
      expect(firstTrip?.unlocked).toBe(true);
    });

    it('unlocks badges from current stats when not yet persisted', async () => {
      const badges = await service.getBadges('user-1');
      const explorer = badges.find((b) => b.key === 'explorer');
      expect(explorer?.unlocked).toBe(false);
      const firstTrip = badges.find((b) => b.key === 'first_trip');
      expect(firstTrip?.unlocked).toBe(true);
    });
  });

  describe('handleHistoryUpdated', () => {
    it('unlocks badges after history update', async () => {
      await service.handleHistoryUpdated(new HistoryUpdatedEvent('user-1'));
      expect(favoritesService.getStats).toHaveBeenCalledWith('user-1');
      expect(badgeRepo.save).toHaveBeenCalled();
    });
  });

  describe('handleFavoritesUpdated', () => {
    it('unlocks badges after favorites update', async () => {
      const { FavoritesUpdatedEvent } = await import('../notifications/events');
      await service.handleFavoritesUpdated(new FavoritesUpdatedEvent('user-1'));
      expect(favoritesService.getStats).toHaveBeenCalledWith('user-1');
      expect(badgeRepo.save).toHaveBeenCalled();
    });
  });
});
