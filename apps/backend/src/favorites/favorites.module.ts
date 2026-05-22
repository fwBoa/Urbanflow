import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favorite } from './favorite.entity';
import { History } from './history.entity';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';

/**
 * Module Favorites — Persistance PostgreSQL des favoris et historique
 * Diagramme classes §4.2 Dossier Technique
 */
@Module({
  imports: [TypeOrmModule.forFeature([Favorite, History])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
