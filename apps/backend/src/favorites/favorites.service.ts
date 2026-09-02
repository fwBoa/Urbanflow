import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Favorite } from './favorite.entity';
import { History } from './history.entity';
import { CreateFavoriteDto, CreateHistoryDto } from './favorites.dto';
import {
  HistoryUpdatedEvent,
  FavoritesUpdatedEvent,
} from '../notifications/events';

@Injectable()
export class FavoritesService implements OnModuleInit {
  constructor(
    @InjectRepository(Favorite)
    private readonly favRepo: Repository<Favorite>,
    @InjectRepository(History)
    private readonly histRepo: Repository<History>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Cleanup au démarrage : fusionne les doublons de lignes suivies créés
   * avant l'introduction de la dédup par identité (bug prod RER A : « A »
   * et « C01742 » enregistrés comme deux favoris distincts). Idempotent —
   * ne touche qu'aux favoris de type « line », garde le plus récent.
   */
  async onModuleInit(): Promise<void> {
    try {
      const lineFavorites = await this.favRepo.find({
        where: { type: 'line' },
        order: { createdAt: 'DESC' },
      });
      const seen = new Map<string, Favorite>();
      const toDelete: string[] = [];
      for (const fav of lineFavorites) {
        const key = this.lineIdentityKey(fav.mode, fav.lineId);
        if (seen.has(key)) {
          toDelete.push(fav.id);
        } else {
          seen.set(key, fav);
        }
      }
      if (toDelete.length > 0) {
        await this.favRepo.delete(toDelete);
      }
    } catch {
      // Best-effort : ne jamais bloquer le démarrage pour un cleanup.
    }
  }

  // ─── Favorites CRUD ────────────────────────────────────────────

  async getFavorites(userId: string): Promise<Favorite[]> {
    return this.favRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Clé d'identité d'une ligne suivie, indépendante du libellé brut.
   * Historique du bug : le même RER A pouvait être ajouté deux fois car
   * les sources utilisaient des `lineId` incompatibles (« A » depuis un
   * segment Navitia, « C01742 » depuis le référentiel réseau) et un `mode`
   * hétérogène (« RER », « rer », « A »). La clé canonique retient le mode
   * normalisé + le code de ligne (dernier token), comparés après
   * normalisation casse/accents/espaces.
   */
  private lineIdentityKey(
    mode: string | undefined,
    lineId: string | null,
  ): string {
    const code = (lineId ?? '')
      // Unifier les référentiels : « line:IDFM:C01742 » et « C01742 ».
      .replace(/^line:IDFM:/i, '')
      .toUpperCase()
      .trim();
    // Les IDs techniques (C01742) sont déjà globalement uniques : ils
    // suffisent seuls. Sinon on retombe sur mode normalisé + code brut
    // (« A », « 12 »), suffisant pour distinguer RER A / Métro A fictif.
    if (/^[A-Z]\d+$/.test(code)) {
      return `id:${code}`;
    }
    const m = (mode ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    let modeKey = 'autre';
    if (m.includes('metro')) modeKey = 'metro';
    else if (m.includes('rer')) modeKey = 'rer';
    else if (m.includes('tram')) modeKey = 'tram';
    else if (m.includes('bus')) modeKey = 'bus';
    else if (m.includes('transilien') || m.includes('train'))
      modeKey = 'transilien';
    return `${modeKey}:${code}`;
  }

  async addFavorite(userId: string, dto: CreateFavoriteDto): Promise<Favorite> {
    const type = dto.type || 'journey';

    // Vérification des doublons selon le type de favori
    if (type === 'line') {
      // Lignes suivies : dédup par identité de ligne (mode normalisé + code),
      // pas par libellé brut — sinon « RER »/« rer »/« A » pour la même
      // ligne créent des doublons (bug constaté en prod sur le RER A).
      const identity = this.lineIdentityKey(dto.mode, dto.lineId ?? null);
      const candidates = await this.favRepo.find({
        where: { userId, type: 'line' },
      });
      const duplicate = candidates.find(
        (f) => this.lineIdentityKey(f.mode, f.lineId) === identity,
      );
      if (duplicate) {
        // Réaligne silencieusement l'ancien enregistrement (libellé/ID
        // périmés) vers les valeurs fraîches sans créer de doublon.
        duplicate.mode = dto.mode;
        duplicate.modeColor = dto.modeColor;
        duplicate.lineId = dto.lineId ?? duplicate.lineId;
        return this.favRepo.save(duplicate);
      }
    } else {
      const duplicateWhere: Record<string, unknown> = {
        userId,
        type,
        mode: dto.mode,
        from: dto.from ?? null,
        to: dto.to ?? null,
      };
      const existing = await this.favRepo.findOne({ where: duplicateWhere });
      if (existing) return existing;
    }

    const favorite = this.favRepo.create({
      userId,
      type,
      lineId: type === 'line' ? (dto.lineId ?? null) : null,
      from: type === 'journey' ? (dto.from ?? null) : null,
      to: type === 'journey' ? (dto.to ?? null) : null,
      mode: dto.mode,
      modeColor: dto.modeColor,
      duration: dto.duration,
      departureTime: dto.departureTime ? new Date(dto.departureTime) : null,
      co2: dto.co2,
      originLat: dto.originLat ?? null,
      originLon: dto.originLon ?? null,
      destLat: dto.destLat ?? null,
      destLon: dto.destLon ?? null,
    });

    const saved = await this.favRepo.save(favorite);
    this.eventEmitter.emit(
      'favorites.updated',
      new FavoritesUpdatedEvent(userId),
    );
    return saved;
  }

  async removeFavorite(userId: string, favoriteId: string): Promise<void> {
    const result = await this.favRepo.delete({ id: favoriteId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Favori non trouvé');
    }
    this.eventEmitter.emit(
      'favorites.updated',
      new FavoritesUpdatedEvent(userId),
    );
  }

  async isFavorite(
    userId: string,
    from: string,
    to: string,
    mode: string,
    type: 'journey' | 'line' = 'journey',
    lineId?: string,
  ): Promise<boolean> {
    const where: Record<string, unknown> = { userId, type, mode };
    if (type === 'journey') {
      where.from = from;
      where.to = to;
    } else if (lineId) {
      where.lineId = lineId;
    }
    return !!(await this.favRepo.findOne({ where }));
  }

  async isFavoriteLine(userId: string, lineId: string): Promise<boolean> {
    return !!(await this.favRepo.findOne({
      where: { userId, type: 'line', lineId },
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
    await this.histRepo.delete({
      userId,
      from: dto.from,
      to: dto.to,
      mode: dto.mode,
    });

    const entry = this.histRepo.create({
      userId,
      from: dto.from,
      to: dto.to,
      mode: dto.mode,
      modeColor: dto.modeColor,
      duration: dto.duration,
      co2: dto.co2,
      tripDate: new Date(),
      originLat: dto.originLat ?? null,
      originLon: dto.originLon ?? null,
      destLat: dto.destLat ?? null,
      destLon: dto.destLon ?? null,
    });

    const saved = await this.histRepo.save(entry);

    // Notify badge service that history has changed
    this.eventEmitter.emit('history.updated', new HistoryUpdatedEvent(userId));

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
    // Persist currently unlocked badges before clearing history so they survive.
    this.eventEmitter.emit('history.updated', new HistoryUpdatedEvent(userId));

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

  async incrementTrips(
    userId: string,
    co2: number,
  ): Promise<{
    totalTrips: number;
    co2Saved: number;
    favoriteCount: number;
  }> {
    void co2;
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
