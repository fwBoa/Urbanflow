import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/user.entity';
import { Notification } from './notification.entity';
import { PushSubscription } from './push-subscription.entity';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsEventsListener } from './notifications-events.listener';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, PushSubscription, User])],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, NotificationsEventsListener],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
