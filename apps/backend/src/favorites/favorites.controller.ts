import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Param,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto, CreateHistoryDto } from './favorites.dto';

@Controller('favorites')
@UseGuards(AuthGuard('jwt'))
export class FavoritesController {
  constructor(private readonly favService: FavoritesService) {}

  // ─── Favorites ────────────────────────────────────────────────

  @Get()
  async getFavorites(@Request() req: { user: { id: string } }) {
    return this.favService.getFavorites(req.user.id);
  }

  @Post()
  async addFavorite(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateFavoriteDto,
  ) {
    return this.favService.addFavorite(req.user.id, dto);
  }

  @Delete(':id')
  async removeFavorite(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.favService.removeFavorite(req.user.id, id);
    return { message: 'Favori supprimé' };
  }

  @Get('check')
  async checkFavorite(
    @Request() req: { user: { id: string } },
    @Body() body: { from: string; to: string; mode: string },
  ) {
    const isFav = await this.favService.isFavorite(req.user.id, body.from, body.to, body.mode);
    return { isFavorite: isFav };
  }

  // ─── History ──────────────────────────────────────────────────

  @Get('history')
  async getHistory(@Request() req: { user: { id: string } }) {
    return this.favService.getHistory(req.user.id);
  }

  @Post('history')
  async addToHistory(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateHistoryDto,
  ) {
    return this.favService.addToHistory(req.user.id, dto);
  }

  @Delete('history')
  async clearHistory(@Request() req: { user: { id: string } }) {
    await this.favService.clearHistory(req.user.id);
    return { message: 'Historique effacé' };
  }

  // ─── Stats ────────────────────────────────────────────────────

  @Get('stats')
  async getStats(@Request() req: { user: { id: string } }) {
    return this.favService.getStats(req.user.id);
  }
}