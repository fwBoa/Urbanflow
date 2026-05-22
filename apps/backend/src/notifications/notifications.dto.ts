import { IsString, IsIn, IsOptional, IsBoolean } from 'class-validator';

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