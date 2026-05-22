import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from './favorite.entity';
import { History } from './history.entity';
import { CreateFavoriteDto, CreateHistoryDto } from './favorites.dto';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favRepo: Repository<Favorite>,
    @InjectRepository(History)
    private readonly histRepo: Repository<History>,
  ) {}

  // ─── Favorites CRUD ────────────────────────────────────────────

  async getFavorites(userId: string): Promise<Favorite[]> {
    return this.favRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async addFavorite(userId: string, dto: CreateFavoriteDto): Promise<Favorite> {
    // Check for duplicate
    const existing = await this.favRepo.findOne({
      where: {
        userId,
        from: dto.from,
        to: dto.to,
        mode: dto.mode,
      },
    });
    if (existing) return existing;

    const favorite = this.favRepo.create({
      userId,
      from: dto.from,
      to: dto.to,
      mode: dto.mode,
      modeColor: dto.modeColor,
      duration: dto.duration,
      co2: dto.co2,
      originLat: dto.originLat ?? null,
      originLon: dto.originLon ?? null,
      destLat: dto.destLat ?? null,
      destLon: dto.destLon ?? null,
    });

    return this.favRepo.save(favorite);
  }

  async removeFavorite(userId: string, favoriteId: string): Promise<void> {
    const result = await this.favRepo.delete({ id: favoriteId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Favori non trouvé');
    }
  }

  async isFavorite(userId: string, from: string, to: string, mode: string): Promise<boolean> {
    return !!(await this.favRepo.findOne({
      where: { userId, from, to, mode },
    }));
  }

  // ─── History ───────────────────────────────────────────────────

  async getHistory(userId: string): Promise<History[]> {
    return this.histRepo.find({
      where: { userId },
      order: { tripDate: 'DESC' },
      take: 20,
    });
  }

  async addToHistory(userId: string, dto: CreateHistoryDto): Promise<History> {
    // Remove duplicate if same route was just searched
    await this.histRepo.delete({ userId, from: dto.from, to: dto.to, mode: dto.mode });

    const entry = this.histRepo.create({
      userId,
      from: dto.from,
      to: dto.to,
      mode: dto.mode,
      modeColor: dto.modeColor,
      duration: dto.duration,
      co2: dto.co2,
      tripDate: new Date(),
    });

    const saved = await this.histRepo.save(entry);

    // Keep only last 20 entries
    const all = await this.histRepo.find({
      where: { userId },
      order: { tripDate: 'DESC' },
    });
    if (all.length > 20) {
      const idsToRemove = all.slice(20).map((h) => h.id);
      await this.histRepo.delete(idsToRemove);
    }

    return saved;
  }

  async clearHistory(userId: string): Promise<void> {
    await this.histRepo.delete({ userId });
  }

  // ─── Stats ────────────────────────────────────────────────────

  async getStats(userId: string): Promise<{
    totalTrips: number;
    co2Saved: number;
    favoriteCount: number;
  }> {
    const [favorites, history] = await Promise.all([
      this.favRepo.count({ where: { userId } }),
      this.histRepo.find({ where: { userId } }),
    ]);

    const totalTrips = history.length;
    const co2Saved = history.reduce(
      (sum, h) => sum + (h.co2 > 0 ? Math.round(Number(h.co2) * 4.3) : 0),
      0,
    );

    return {
      totalTrips,
      co2Saved,
      favoriteCount: favorites,
    };
  }

  async incrementTrips(userId: string, co2: number): Promise<{
    totalTrips: number;
    co2Saved: number;
    favoriteCount: number;
  }> {
    return this.getStats(userId);
  }

  // ─── RGPD: Export data ─────────────────────────────────────────

  async exportUserData(userId: string): Promise<{
    favorites: Favorite[];
    history: History[];
  }> {
    const [favorites, history] = await Promise.all([
      this.getFavorites(userId),
      this.getHistory(userId),
    ]);
    return { favorites, history };
  }
}