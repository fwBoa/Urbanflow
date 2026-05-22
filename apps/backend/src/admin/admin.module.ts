import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/user.entity';
import { History } from '../favorites/history.entity';
import { Notification } from '../notifications/notification.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TransportModule } from '../transport/transport.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, History, Notification]),
    TransportModule, // Provides PrimService and GtfsParserService
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
