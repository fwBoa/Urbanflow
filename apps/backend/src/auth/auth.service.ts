import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from './user.entity';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  ConsentDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.dto';
import { FavoritesService } from '../favorites/favorites.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { PasswordResetToken } from './password-reset-token.entity';
import crypto from 'node:crypto';

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepo: Repository<PasswordResetToken>,
    private readonly jwtService: JwtService,
    private readonly favoritesService: FavoritesService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
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

  // ─── Mot de passe oublié ───
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });

    // Always return the same generic message to prevent user enumeration.
    const genericMessage =
      'Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.';

    if (!user) {
      return { message: genericMessage };
    }

    if (!this.mailService.isConfigured()) {
      this.logger.warn(
        'Password reset requested but mail service is not configured',
      );
      return { message: genericMessage };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 12);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const resetToken = this.resetTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      usedAt: null,
    });
    await this.resetTokenRepo.save(resetToken);

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'https://urbanflow-mobility.fr',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    await this.mailService.send({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe UrbanFlow',
      text: `Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien suivant (valable 1 heure) :

${resetUrl}

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.

L'équipe UrbanFlow`,
      html: `<p>Bonjour,</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous (valable 1 heure) :</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
        <p>L'équipe UrbanFlow</p>`,
    });

    return { message: genericMessage };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new UnauthorizedException(
        'Les nouveaux mots de passe ne correspondent pas',
      );
    }

    const resetToken = await this.resetTokenRepo.findOne({
      where: { usedAt: undefined },
      order: { createdAt: 'DESC' },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Le lien de réinitialisation est invalide ou a expiré',
      );
    }

    const isTokenValid = await bcrypt.compare(dto.token, resetToken.tokenHash);
    if (!isTokenValid) {
      throw new UnauthorizedException(
        'Le lien de réinitialisation est invalide ou a expiré',
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: resetToken.userId },
      select: ['id', 'passwordHash'],
    });
    if (!user) {
      throw new UnauthorizedException(
        'Le lien de réinitialisation est invalide ou a expiré',
      );
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.updatedAt = new Date();
    await this.userRepo.save(user);

    resetToken.usedAt = new Date();
    await this.resetTokenRepo.save(resetToken);

    return { message: 'Mot de passe réinitialisé avec succès' };
  }
}
