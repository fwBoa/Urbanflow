import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { AdminService } from './admin.service';

/**
 * Contrôleur Admin — Réservé aux utilisateurs avec rôle 'admin'
 *
 * Routes disponibles :
 * - GET    /api/admin/dashboard        → Stats globales (utilisateurs, trajets, CO₂)
 * - GET    /api/admin/users            → Liste des utilisateurs
 * - GET    /api/admin/users/:id        → Détail d'un utilisateur
 * - DELETE /api/admin/users/:id        → Supprimer un utilisateur
 * - GET    /api/admin/trips            → Tous les trajets (paginé)
 * - GET    /api/admin/notifications    → Toutes les notifications
 * - POST   /api/admin/broadcast        → Notification globale à tous les utilisateurs
 * - POST   /api/admin/gtfs/reload      → Recharger les données GTFS
 * - GET    /api/admin/gtfs/status      → État des données GTFS
 */
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Dashboard analytics ────────────────────────────────────────────────

  @Get('dashboard')
  @Roles('admin')
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // ─── Gestion des utilisateurs ───────────────────────────────────────────

  @Get('users')
  @Roles('admin')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('users/:id')
  @Roles('admin')
  async getUserById(@Param('id') id: string) {
    const user = await this.adminService.getUserById(id);
    if (!user) {
      throw new HttpException('Utilisateur non trouvé', HttpStatus.NOT_FOUND);
    }
    return user;
  }

  @Delete('users/:id')
  @Roles('admin')
  async deleteUser(@Param('id') id: string) {
    await this.adminService.deleteUser(id);
    return { message: 'Utilisateur supprimé' };
  }

  // ─── Trajets ────────────────────────────────────────────────────────────

  @Get('trips')
  @Roles('admin')
  async getAllTrips(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.adminService.getAllTrips(parsedLimit, parsedOffset);
  }

  // ─── Notifications ──────────────────────────────────────────────────────

  @Get('notifications')
  @Roles('admin')
  async getAllNotifications() {
    return this.adminService.getAllNotifications();
  }

  @Post('broadcast')
  @Roles('admin')
  async broadcastNotification(
    @Body()
    body: {
      title: string;
      message: string;
      type?: string;
      lineId?: string;
    },
  ) {
    const count = await this.adminService.broadcastNotification(body);
    return { message: 'Notification envoyée', count };
  }

  // ─── Gestion GTFS ───────────────────────────────────────────────────────

  @Post('gtfs/reload')
  @Roles('admin')
  async reloadGtfs() {
    try {
      await this.adminService.reloadGtfs();
      return { success: true, message: 'Données GTFS rechargées' };
    } catch (error) {
      throw new HttpException(
        `Échec rechargement GTFS: ${error instanceof Error ? error.message : error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('gtfs/status')
  @Roles('admin')
  async getGtfsStatus() {
    return this.adminService.getGtfsStatus();
  }
}
