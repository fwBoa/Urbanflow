import {
  IsString,
  IsIn,
  IsOptional,
  IsBoolean,
  IsObject,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsIn(['disruption', 'delay', 'info', 'favorite_alert', 'system'])
  type: 'disruption' | 'delay' | 'info' | 'favorite_alert' | 'system';

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  relatedLine?: string;

  @IsOptional()
  @IsString()
  relatedStop?: string;

  @IsOptional()
  @IsString()
  actionUrl?: string;
}

export class MarkReadDto {
  @IsBoolean()
  isRead: boolean;
}

class PushSubscriptionKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

export class SubscribePushDto {
  @IsString()
  endpoint: string;

  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}

export class UnsubscribePushDto {
  @IsString()
  endpoint: string;
}
