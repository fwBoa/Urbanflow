import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TransportModule } from './transport/transport.module';
import { AuthModule } from './auth/auth.module';
import { FavoritesModule } from './favorites/favorites.module';
import { User } from './auth/user.entity';
import { Favorite } from './favorites/favorite.entity';
import { History } from './favorites/history.entity';
import { Notification } from './notifications/notification.entity';
import { PushSubscription } from './notifications/push-subscription.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    // ─── Event-driven notifications (Phase 4) ───
    EventEmitterModule.forRoot(),
    // ─── OWASP: Rate limiting (§5.5 Dossier Technique) ───
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 100 }, // 100 requests per minute globally
    ]),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        url:
          process.env.DATABASE_URL ||
          'postgresql://urbanflow:urbanflow_dev@localhost:5432/urbanflow',
        entities: [User, Favorite, History, Notification, PushSubscription], // PasswordResetToken auto-loaded via AuthModule
        // AdminModule entities are loaded via TypeOrmModule.forFeature()
        // ─── Never auto-mutate the schema in production (data-loss risk). ───
        // Use migrations in prod; synchronize only re-syncs the dev schema.
        synchronize: process.env.NODE_ENV !== 'production',
        logging: false,
        // Retry connection for up to 30 seconds
        connectTimeoutMS: 30000,
        // Don't crash on startup if DB is unavailable
        autoLoadEntities: true,
      }),
      // If DB connection fails, the app still starts
      // TypeORM will retry connections automatically
    }),
    AuthModule,
    FavoritesModule,
    NotificationsModule,
    TransportModule,
    AdminModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply ThrottlerGuard globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
