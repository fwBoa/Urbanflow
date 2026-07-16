import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/user.entity';
import { Favorite } from '../favorites/favorite.entity';
import { Notification } from './notification.entity';
import { PushSubscription } from './push-subscription.entity';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsEventsListener } from './notifications-events.listener';
import { NotificationsSchedulerService } from './notifications-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, PushSubscription, User, Favorite]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PushService,
    NotificationsEventsListener,
    NotificationsSchedulerService,
  ],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
