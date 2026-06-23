import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto, MarkReadDto } from './notifications.dto';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notifService: NotificationsService) {}

  /** GET /api/notifications — list all notifications for current user */
  @Get()
  async getAll(@Request() req: any) {
    return this.notifService.getNotifications(req.user.id);
  }

  /** GET /api/notifications/unread-count — get unread count */
  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    const count = await this.notifService.getUnreadCount(req.user.id);
    return { count };
  }

  /** PATCH /api/notifications/:id/read — mark one as read */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    const notif = await this.notifService.markAsRead(id, req.user.id);
    return notif ?? { message: 'Notification not found' };
  }

  /** POST /api/notifications/mark-all-read — mark all as read */
  @Post('mark-all-read')
  async markAllAsRead(@Request() req: any) {
    await this.notifService.markAllAsRead(req.user.id);
    return { message: 'All notifications marked as read' };
  }

  /** DELETE /api/notifications/:id — delete one notification */
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    const deleted = await this.notifService.remove(id, req.user.id);
    return { deleted };
  }

  /** DELETE /api/notifications — delete all notifications (RGPD) */
  @Delete()
  async removeAll(@Request() req: any) {
    await this.notifService.removeAllForUser(req.user.id);
    return { message: 'All notifications deleted' };
  }
}