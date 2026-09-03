import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Repository, In } from 'typeorm';
import { BadgeUnlock } from './badge.entity';
import { FavoritesService } from '../favorites/favorites.service';
import {
  HistoryUpdatedEvent,
  FavoritesUpdatedEvent,
  BadgeUnlockedEvent,
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
    private readonly eventEmitter: EventEmitter2,
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
    const saved = await this.badgeRepo.save(unlock);

    // Notifie l'utilisateur de son nouveau badge (push + cloche in-app).
    // Émis APRÈS la persistance — jamais pour un badge déjà possédé.
    const def = BADGE_DEFINITIONS.find((d) => d.key === badgeKey);
    if (def) {
      this.eventEmitter.emit(
        'badge.unlocked',
        new BadgeUnlockedEvent(userId, def.key, def.label, def.emoji),
      );
    }
    return saved;
  }

  /**
   * Retourne tous les badges avec leur état de déblocage.
   *
   * `celebrate=true` (profil) : les badges débloqués non encore vus
   * (`seenAt` null) sont retournés avec `newlyUnlocked: true` puis marqués
   * vus — source de vérité serveur pour la célébration animée, plus fiable
   * que l'ancien marqueur localStorage (un rechargement pouvait consommer
   * la détection sans que l'utilisateur voie l'animation).
   */
  async getBadges(userId: string, celebrate = false): Promise<BadgeDto[]> {
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

    // Badges persistés jamais vus → célébration à l'ouverture du profil.
    let freshKeys = new Set<string>();
    if (celebrate) {
      const rows = await this.badgeRepo.find({ where: { userId } });
      freshKeys = new Set(rows.filter((r) => !r.seenAt).map((r) => r.badgeKey));
    }

    const result = BADGE_DEFINITIONS.map((def) => ({
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      description: def.description,
      unlocked: unlockedSet.has(def.key) || def.condition(stats),
      newlyUnlocked:
        celebrate && freshKeys.has(def.key) ? (true as const) : undefined,
    }));
    // Marquer vu seulement après avoir construit la réponse (best-effort :
    // un échec de marquage ne doit pas casser la lecture).
    if (celebrate && freshKeys.size > 0) {
      this.badgeRepo
        .update(
          { userId, badgeKey: In(Array.from(freshKeys)) },
          { seenAt: new Date() },
        )
        .catch(() => undefined);
    }
    return result;
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
