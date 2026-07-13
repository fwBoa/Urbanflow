import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from './user.entity';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  ConsentDto,
  ChangePasswordDto,
} from './auth.dto';
import { FavoritesService } from '../favorites/favorites.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatar: string;
    preferredMode: string;
    accessibilityNeeds: boolean;
    role: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly favoritesService: FavoritesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Un compte avec cet email existe déjà');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName || dto.email.split('@')[0],
      preferredMode: dto.preferredMode || 'rapide',
      accessibilityNeeds: dto.accessibilityNeeds || false,
      avatar: '🚇',
    });

    const saved = await this.userRepo.save(user);
    return this.createAuthResponse(saved);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Update last login timestamp
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return this.createAuthResponse(user);
  }

  async getProfile(userId: string): Promise<AuthResponse['user']> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
    return this.sanitizeUser(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<AuthResponse['user']> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.avatar !== undefined) user.avatar = dto.avatar;
    if (dto.preferredMode !== undefined) user.preferredMode = dto.preferredMode;
    if (dto.accessibilityNeeds !== undefined)
      user.accessibilityNeeds = dto.accessibilityNeeds;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new UnauthorizedException(
        'Les nouveaux mots de passe ne correspondent pas',
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash'],
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.updatedAt = new Date();
    await this.userRepo.save(user);

    return { message: 'Mot de passe mis à jour' };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  // ─── RGPD: Droit à l'effacement (Art. 17) ───
  async deleteAccount(userId: string): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    // Soft-delete: TypeORM DeleteDateColumn sets deletedAt
    await this.userRepo.softDelete(userId);
    return {
      message:
        'Compte supprimé. Vos données seront définitivement effacées sous 30 jours.',
    };
  }

  // ─── RGPD: Droit à la portabilité (Art. 20) ───
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Get real favorites and history from database
    const favData = await this.favoritesService.exportUserData(userId);

    return {
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        preferredMode: user.preferredMode,
        accessibilityNeeds: user.accessibilityNeeds,
        consentGeoloc: user.consentGeoloc,
        consentCookies: user.consentCookies,
        consentHistory: user.consentHistory,
        consentDate: user.consentDate,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      favorites: favData.favorites,
      history: favData.history,
      notifications: await this.notificationsService.exportForUser(userId),
    };
  }

  // ─── RGPD: Gestion du consentement (§9.2) ───
  async updateConsent(
    userId: string,
    dto: ConsentDto,
  ): Promise<AuthResponse['user']> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    user.consentGeoloc = dto.consentGeoloc;
    user.consentCookies = dto.consentCookies;
    user.consentHistory = dto.consentHistory;
    user.consentDate = new Date();
    user.consentVersion = dto.consentVersion || '1.0';
    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  // ─── RGPD: Vérifier le consentement géoloc ───
  async getConsent(userId: string): Promise<{
    consentGeoloc: boolean;
    consentCookies: boolean;
    consentHistory: boolean;
    consentDate: Date | null;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return {
      consentGeoloc: user.consentGeoloc,
      consentCookies: user.consentCookies,
      consentHistory: user.consentHistory,
      consentDate: user.consentDate,
    };
  }

  private createAuthResponse(user: User): AuthResponse {
    const payload = { sub: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
      user: this.sanitizeUser(user),
    };
  }

  private sanitizeUser(user: User): AuthResponse['user'] {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar || '🚇',
      preferredMode: user.preferredMode,
      accessibilityNeeds: user.accessibilityNeeds,
      role: user.role,
    };
  }

  // ─── Notification preferences ───
  async updateNotificationsPreference(
    userId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    user.notificationsEnabled = enabled;
    await this.userRepo.save(user);
    return { enabled };
  }
}
