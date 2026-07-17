import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { FavoritesService } from './favorites.service';
import { Favorite } from './favorite.entity';
import { History } from './history.entity';
import { CreateFavoriteDto, CreateHistoryDto } from './favorites.dto';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let module: TestingModule;
  let favRepo: Repository<Favorite>;
  let histRepo: Repository<History>;

  const mockFavorite: Favorite = {
    id: 'fav-1',
    userId: 'user-1',
    type: 'journey',
    lineId: null,
    from: 'A',
    to: 'B',
    mode: 'metro',
    modeColor: '#007852',
    duration: '15 min',
    co2: 12.34,
    originLat: 48.85,
    originLon: 2.35,
    destLat: 48.86,
    destLon: 2.36,
    createdAt: new Date(),
    user: undefined as any,
  };

  const mockHistory: History = {
    id: 'hist-1',
    userId: 'user-1',
    from: 'A',
    to: 'B',
    mode: 'metro',
    modeColor: '#007852',
    duration: '15 min',
    co2: 12.34,
    tripDate: new Date(),
    originLat: 48.85,
    originLon: 2.35,
    destLat: 48.86,
    destLon: 2.36,
    user: undefined as any,
  };

  const createFavoriteDto: CreateFavoriteDto = {
    from: 'A',
    to: 'B',
    mode: 'metro',
    modeColor: '#007852',
    duration: '15 min',
    co2: 12.34,
  };

  const createHistoryDto: CreateHistoryDto = {
    from: 'A',
    to: 'B',
    mode: 'metro',
    modeColor: '#007852',
    duration: '15 min',
    co2: 12.34,
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        FavoritesService,
        {
          provide: getRepositoryToken(Favorite),
          useValue: {
            find: jest.fn().mockResolvedValue([mockFavorite]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockReturnValue(mockFavorite),
            save: jest.fn().mockResolvedValue(mockFavorite),
            delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
            count: jest.fn().mockResolvedValue(3),
          },
        },
        {
          provide: getRepositoryToken(History),
          useValue: {
            find: jest.fn().mockResolvedValue([mockHistory]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockReturnValue(mockHistory),
            save: jest.fn().mockResolvedValue(mockHistory),
            delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
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

    service = module.get<FavoritesService>(FavoritesService);
    favRepo = module.get<Repository<Favorite>>(getRepositoryToken(Favorite));
    histRepo = module.get<Repository<History>>(getRepositoryToken(History));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFavorites', () => {
    it('returns favorites for a user ordered by createdAt DESC', async () => {
      const result = await service.getFavorites('user-1');
      expect(result).toEqual([mockFavorite]);
      expect(favRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('addFavorite', () => {
    it('creates a new favorite when none exists', async () => {
      jest.spyOn(favRepo, 'findOne').mockResolvedValue(null);
      const result = await service.addFavorite('user-1', createFavoriteDto);
      expect(result).toEqual(mockFavorite);
      expect(favRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          from: 'A',
          to: 'B',
          mode: 'metro',
        }),
      );
      expect(favRepo.save).toHaveBeenCalledWith(mockFavorite);
    });

    it('returns existing favorite when duplicate', async () => {
      jest.spyOn(favRepo, 'findOne').mockResolvedValue(mockFavorite);
      const result = await service.addFavorite('user-1', createFavoriteDto);
      expect(result).toBe(mockFavorite);
      expect(favRepo.create).not.toHaveBeenCalled();
      expect(favRepo.save).not.toHaveBeenCalled();
    });

    it('emits favorites.updated event after creating', async () => {
      const eventEmitter = module.get(EventEmitter2);
      jest.spyOn(favRepo, 'findOne').mockResolvedValue(null);
      await service.addFavorite('user-1', createFavoriteDto);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'favorites.updated',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });

  describe('removeFavorite', () => {
    it('deletes favorite when found', async () => {
      jest.spyOn(favRepo, 'delete').mockResolvedValue({ affected: 1, raw: [] });
      await service.removeFavorite('user-1', 'fav-1');
      expect(favRepo.delete).toHaveBeenCalledWith({
        id: 'fav-1',
        userId: 'user-1',
      });
    });

    it('emits favorites.updated event after deleting', async () => {
      const eventEmitter = module.get(EventEmitter2);
      jest.spyOn(favRepo, 'delete').mockResolvedValue({ affected: 1, raw: [] });
      await service.removeFavorite('user-1', 'fav-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'favorites.updated',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws NotFoundException when no favorite deleted', async () => {
      jest.spyOn(favRepo, 'delete').mockResolvedValue({ affected: 0, raw: [] });
      await expect(service.removeFavorite('user-1', 'fav-1')).rejects.toThrow(
        'Favori non trouvé',
      );
    });
  });

  describe('isFavorite', () => {
    it('returns true when favorite exists', async () => {
      jest.spyOn(favRepo, 'findOne').mockResolvedValue(mockFavorite);
      const result = await service.isFavorite('user-1', 'A', 'B', 'metro');
      expect(result).toBe(true);
    });

    it('returns false when favorite does not exist', async () => {
      jest.spyOn(favRepo, 'findOne').mockResolvedValue(null);
      const result = await service.isFavorite('user-1', 'A', 'B', 'bus');
      expect(result).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('returns last 20 history entries', async () => {
      const result = await service.getHistory('user-1');
      expect(result).toEqual([mockHistory]);
      expect(histRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { tripDate: 'DESC' },
        take: 20,
      });
    });
  });

  describe('addToHistory', () => {
    it('creates a history entry and trims to 20 entries', async () => {
      jest
        .spyOn(histRepo, 'delete')
        .mockResolvedValue({ affected: 0, raw: [] });
      jest.spyOn(histRepo, 'create').mockReturnValue(mockHistory);
      jest.spyOn(histRepo, 'save').mockResolvedValue(mockHistory);
      jest.spyOn(histRepo, 'find').mockResolvedValue(
        Array.from({ length: 21 }, (_, i) => ({
          ...mockHistory,
          id: `hist-${i}`,
        })),
      );

      const result = await service.addToHistory('user-1', createHistoryDto);
      expect(result).toEqual(mockHistory);
      expect(histRepo.delete).toHaveBeenCalledWith({
        userId: 'user-1',
        from: 'A',
        to: 'B',
        mode: 'metro',
      });
      expect(histRepo.save).toHaveBeenCalledWith(mockHistory);
    });

    it('emits history.updated event', async () => {
      const eventEmitter = module.get(EventEmitter2);
      jest
        .spyOn(histRepo, 'delete')
        .mockResolvedValue({ affected: 0, raw: [] });
      jest.spyOn(histRepo, 'find').mockResolvedValue([mockHistory]);

      await service.addToHistory('user-1', createHistoryDto);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'history.updated',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });

  describe('clearHistory', () => {
    it('deletes all history for a user', async () => {
      await service.clearHistory('user-1');
      expect(histRepo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('emits history.updated event before deleting', async () => {
      const eventEmitter = module.get(EventEmitter2);
      await service.clearHistory('user-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'history.updated',
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(histRepo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });

  describe('getStats', () => {
    it('returns totalTrips, co2Saved and favoriteCount', async () => {
      const result = await service.getStats('user-1');
      expect(result).toEqual({
        totalTrips: 1,
        co2Saved: Math.round(12.34 * 4.3),
        favoriteCount: 3,
      });
    });
  });

  describe('incrementTrips', () => {
    it('delegates to getStats', async () => {
      const spy = jest.spyOn(service, 'getStats').mockResolvedValue({
        totalTrips: 5,
        co2Saved: 100,
        favoriteCount: 3,
      });
      const result = await service.incrementTrips('user-1', 10);
      expect(spy).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        totalTrips: 5,
        co2Saved: 100,
        favoriteCount: 3,
      });
    });
  });

  describe('exportUserData', () => {
    it('returns favorites and history for RGPD export', async () => {
      const result = await service.exportUserData('user-1');
      expect(result).toEqual({
        favorites: [mockFavorite],
        history: [mockHistory],
      });
    });
  });
});
