import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateFavoriteDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  mode: string;

  @IsString()
  modeColor: string;

  @IsString()
  duration: string;

  @IsNumber()
  @Min(0)
  co2: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLon?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  destLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  destLon?: number;
}

export class CreateHistoryDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsString()
  mode: string;

  @IsString()
  modeColor: string;

  @IsString()
  duration: string;

  @IsNumber()
  @Min(0)
  co2: number;
}
