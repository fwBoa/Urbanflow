import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { BadgeUnlock } from './badge.entity';
import { FavoritesService } from '../favorites/favorites.service';
import {
  HistoryUpdatedEvent,
  FavoritesUpdatedEvent,
} from '../notifications/events';

export interface BadgeDefinition {
  key: string;
  label: string;
  emoji: string;
  description: string;
  condition: (stats: UserBadgeStats) => boolean;
}

export interface UserBadgeStats {
  totalTrips: number;
  co2Saved: number;
  favoriteCount: number;
}

export interface BadgeDto {
  key: string;
  label: string;
  emoji: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: Date;
}

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    key: 'first_trip',
    label: 'Premier trajet',
    emoji: '🎉',
    description: 'Effectuez votre premier trajet',
    condition: (stats) => stats.totalTrips >= 1,
  },
  {
    key: 'eco_warrior',
    label: 'Éco-guerrier',
    emoji: '🌿',
    description: 'Économisez plus de 500g de CO₂',
    condition: (stats) => stats.co2Saved >= 500,
  },
  {
    key: 'explorer',
    label: 'Explorateur',
    emoji: '🗺️',
    description: 'Effectuez 10 trajets',
    condition: (stats) => stats.totalTrips >= 10,
  },
  {
    key: 'regular',
    label: 'Régulier',
    emoji: '🚇',
    description: 'Effectuez 25 trajets',
    condition: (stats) => stats.totalTrips >= 25,
  },
  {
    key: 'velib_fan',
    label: "Vélib' fan",
    emoji: '🚲',
    description: 'Ajoutez 3 favoris',
    condition: (stats) => stats.favoriteCount >= 3,
  },
  {
    key: 'carbon_neutral',
    label: 'Carbone neutre',
    emoji: '🌍',
    description: 'Économisez plus de 5kg de CO₂',
    condition: (stats) => stats.co2Saved >= 5000,
  },
];

@Injectable()
export class BadgesService {
  constructor(
    @InjectRepository(BadgeUnlock)
    private readonly badgeRepo: Repository<BadgeUnlock>,
    private readonly favoritesService: FavoritesService,
  ) {}

  /**
   * Calcule les badges débloqués à partir des stats actuelles et les persiste.
   * Les badges déjà débloqués restent même si l'historique est vidé.
   */
  async unlockBadges(
    userId: string,
    stats: UserBadgeStats,
  ): Promise<BadgeUnlock[]> {
    const newlyUnlocked: BadgeUnlock[] = [];
    for (const def of BADGE_DEFINITIONS) {
      if (def.condition(stats)) {
        const saved = await this.unlockOne(userId, def.key, stats);
        if (saved) newlyUnlocked.push(saved);
      }
    }
    return newlyUnlocked;
  }

  private async unlockOne(
    userId: string,
    badgeKey: string,
    stats: UserBadgeStats,
  ): Promise<BadgeUnlock | null> {
    const exists = await this.badgeRepo.findOne({
      where: { userId, badgeKey },
    });
    if (exists) return null;

    const unlock = this.badgeRepo.create({
      userId,
      badgeKey,
      metadata: { ...stats },
    });
    return this.badgeRepo.save(unlock);
  }

  /**
   * Retourne tous les badges avec leur état de déblocage.
   */
  async getBadges(userId: string): Promise<BadgeDto[]> {
    if (!userId) {
      throw new BadRequestException('userId requis');
    }
    let stats: UserBadgeStats;
    try {
      stats = await this.favoritesService.getStats(userId);
    } catch (err) {
      console.error('[BadgesService] getStats failed for user', userId, err);
      stats = { totalTrips: 0, co2Saved: 0, favoriteCount: 0 };
    }

    let unlockedKeys: string[] = [];
    try {
      unlockedKeys = await this.getUnlockedBadgeKeys(userId);
    } catch (err) {
      console.error(
        '[BadgesService] getUnlockedBadgeKeys failed for user',
        userId,
        err,
      );
    }
    const unlockedSet = new Set(unlockedKeys);

    return BADGE_DEFINITIONS.map((def) => ({
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      description: def.description,
      unlocked: unlockedSet.has(def.key) || def.condition(stats),
    }));
  }

  private async getUnlockedBadgeKeys(userId: string): Promise<string[]> {
    const rows = await this.badgeRepo.find({
      where: { userId },
      select: ['badgeKey'],
    });
    return rows.map((r) => r.badgeKey);
  }

  @OnEvent('history.updated')
  async handleHistoryUpdated(event: HistoryUpdatedEvent): Promise<void> {
    const stats = await this.favoritesService.getStats(event.userId);
    await this.unlockBadges(event.userId, {
      totalTrips: stats.totalTrips,
      co2Saved: stats.co2Saved,
      favoriteCount: stats.favoriteCount,
    });
  }

  @OnEvent('favorites.updated')
  async handleFavoritesUpdated(event: FavoritesUpdatedEvent): Promise<void> {
    const stats = await this.favoritesService.getStats(event.userId);
    await this.unlockBadges(event.userId, {
      totalTrips: stats.totalTrips,
      co2Saved: stats.co2Saved,
      favoriteCount: stats.favoriteCount,
    });
  }
}
