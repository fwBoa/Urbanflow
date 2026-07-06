import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  IsBoolean,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsIn(['rapide', 'eco', 'economique'])
  preferredMode?: string;

  @IsOptional()
  accessibilityNeeds?: boolean;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsIn(['rapide', 'eco', 'economique'])
  preferredMode?: string;

  @IsOptional()
  accessibilityNeeds?: boolean;
}

// ─── RGPD Consent DTO (§9.2 Dossier Technique) ───
export class ConsentDto {
  @IsBoolean()
  consentGeoloc: boolean;

  @IsBoolean()
  consentCookies: boolean;

  @IsBoolean()
  consentHistory: boolean;

  @IsOptional()
  @IsString()
  consentVersion?: string;
}
