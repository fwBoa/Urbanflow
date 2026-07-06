import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto, CreateHistoryDto } from './favorites.dto';

describe('FavoritesController', () => {
  let controller: FavoritesController;
  let service: FavoritesService;

  const req = { user: { id: 'user-1' } };

  const mockFavorite = {
    id: 'fav-1',
    userId: 'user-1',
    from: 'A',
    to: 'B',
    mode: 'metro',
    modeColor: '#007852',
    duration: '15 min',
    co2: 12.34,
  };

  const mockHistory = {
    id: 'hist-1',
    userId: 'user-1',
    from: 'A',
    to: 'B',
    mode: 'metro',
    modeColor: '#007852',
    duration: '15 min',
    co2: 12.34,
    tripDate: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        {
          provide: FavoritesService,
          useValue: {
            getFavorites: jest.fn().mockResolvedValue([mockFavorite]),
            addFavorite: jest.fn().mockResolvedValue(mockFavorite),
            removeFavorite: jest.fn().mockResolvedValue(undefined),
            isFavorite: jest.fn().mockResolvedValue(true),
            getHistory: jest.fn().mockResolvedValue([mockHistory]),
            addToHistory: jest.fn().mockResolvedValue(mockHistory),
            clearHistory: jest.fn().mockResolvedValue(undefined),
            getStats: jest.fn().mockResolvedValue({
              totalTrips: 5,
              co2Saved: 100,
              favoriteCount: 3,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<FavoritesController>(FavoritesController);
    service = module.get<FavoritesService>(FavoritesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFavorites', () => {
    it('returns favorites for current user', async () => {
      const result = await controller.getFavorites(req);
      expect(result).toEqual([mockFavorite]);
      expect(service.getFavorites).toHaveBeenCalledWith('user-1');
    });
  });

  describe('addFavorite', () => {
    it('adds a favorite for current user', async () => {
      const dto: CreateFavoriteDto = {
        from: 'A',
        to: 'B',
        mode: 'metro',
        modeColor: '#007852',
        duration: '15 min',
        co2: 12.34,
      };
      const result = await controller.addFavorite(req, dto);
      expect(result).toEqual(mockFavorite);
      expect(service.addFavorite).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('removeFavorite', () => {
    it('removes a favorite by id', async () => {
      const result = await controller.removeFavorite(req, 'fav-1');
      expect(result).toEqual({ message: 'Favori supprimé' });
      expect(service.removeFavorite).toHaveBeenCalledWith('user-1', 'fav-1');
    });
  });

  describe('checkFavorite', () => {
    it('checks whether a route is a favorite', async () => {
      const body = { from: 'A', to: 'B', mode: 'metro' };
      const result = await controller.checkFavorite(req, body);
      expect(result).toEqual({ isFavorite: true });
      expect(service.isFavorite).toHaveBeenCalledWith(
        'user-1',
        'A',
        'B',
        'metro',
      );
    });
  });

  describe('getHistory', () => {
    it('returns history for current user', async () => {
      const result = await controller.getHistory(req);
      expect(result).toEqual([mockHistory]);
      expect(service.getHistory).toHaveBeenCalledWith('user-1');
    });
  });

  describe('addToHistory', () => {
    it('adds a history entry for current user', async () => {
      const dto: CreateHistoryDto = {
        from: 'A',
        to: 'B',
        mode: 'metro',
        modeColor: '#007852',
        duration: '15 min',
        co2: 12.34,
      };
      const result = await controller.addToHistory(req, dto);
      expect(result).toEqual(mockHistory);
      expect(service.addToHistory).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('clearHistory', () => {
    it('clears history for current user', async () => {
      const result = await controller.clearHistory(req);
      expect(result).toEqual({ message: 'Historique effacé' });
      expect(service.clearHistory).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getStats', () => {
    it('returns stats for current user', async () => {
      const result = await controller.getStats(req);
      expect(result).toEqual({
        totalTrips: 5,
        co2Saved: 100,
        favoriteCount: 3,
      });
      expect(service.getStats).toHaveBeenCalledWith('user-1');
    });
  });
});
