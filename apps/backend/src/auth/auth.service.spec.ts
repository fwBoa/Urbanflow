import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  ConsentDto,
  ChangePasswordDto,
  ForgotPasswordDto,
} from './auth.dto';
import { FavoritesService } from '../favorites/favorites.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { PasswordResetToken } from './password-reset-token.entity';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: Repository<User>;
  let resetTokenRepo: Repository<PasswordResetToken>;
  let mailService: MailService;
  let configService: ConfigService;

  const mockUser: Partial<User> = {
    id: 'user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    avatar: '🚇',
    preferredMode: 'rapide',
    accessibilityNeeds: false,
    role: 'user',
    consentGeoloc: true,
    consentCookies: true,
    consentHistory: true,
    consentDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    passwordHash: 'hashed-old-password',
  };

  const mockFavoritesService = {
    exportUserData: jest.fn().mockResolvedValue({ favorites: [], history: [] }),
  };

  const mockNotificationsService = {
    exportForUser: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
        {
          provide: FavoritesService,
          useValue: mockFavoritesService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: MailService,
          useValue: {
            send: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
            isConfigured: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://urbanflow-mobility.fr'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    resetTokenRepo = module.get<Repository<PasswordResetToken>>(
      getRepositoryToken(PasswordResetToken),
    );
    mailService = module.get<MailService>(MailService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
      preferredMode: 'rapide',
      accessibilityNeeds: false,
    };

    it('should successfully register a new user', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepo, 'create').mockReturnValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser as User);

      const result = await service.register(registerDto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(userRepo.create).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result.user).toHaveProperty('email', registerDto.email);
    });

    it('should throw ConflictException if email already exists', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'Un compte avec cet email existe déjà',
      );
    });

    it('should use default displayName if not provided', async () => {
      const dtoWithoutName = { ...registerDto, displayName: undefined };
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepo, 'create').mockReturnValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser as User);

      await service.register(dtoWithoutName);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'test',
        }),
      );
    });

    it('should hash password with bcrypt', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepo, 'create').mockReturnValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser as User);

      await service.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should successfully login with valid credentials', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser as User);

      const result = await service.login(loginDto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: loginDto.email },
      });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result.user).toHaveProperty('email', loginDto.email);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Email ou mot de passe incorrect',
      );
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should update lastLoginAt on successful login', async () => {
      const mockUserWithLastLogin = { ...mockUser, lastLoginAt: new Date() };
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest
        .spyOn(userRepo, 'save')
        .mockResolvedValue(mockUserWithLastLogin as User);

      await service.login(loginDto);

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastLoginAt: expect.any(Date),
        }),
      );
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);

      const result = await service.getProfile('user-123');

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
      expect(result).toHaveProperty('email', mockUser.email);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.getProfile('unknown-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('updateProfile', () => {
    const updateDto: UpdateProfileDto = {
      displayName: 'Updated Name',
      avatar: '🚲',
      preferredMode: 'eco',
      accessibilityNeeds: true,
    };

    it('should update user profile', async () => {
      const updatedUser = { ...mockUser, ...updateDto };
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(updatedUser as User);

      const result = await service.updateProfile('user-123', updateDto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Updated Name',
          avatar: '🚲',
        }),
      );
      expect(result).toHaveProperty('displayName', 'Updated Name');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateProfile('unknown-id', updateDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('deleteAccount', () => {
    it('should soft-delete user account', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepo, 'softDelete').mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      const result = await service.deleteAccount('user-123');

      expect(userRepo.softDelete).toHaveBeenCalledWith('user-123');
      expect(result).toHaveProperty('message');
      expect(result.message).toContain('30 jours');
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.deleteAccount('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('exportData', () => {
    it('should export user data for GDPR portability', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);

      const result = await service.exportData('user-123');

      expect(result).toHaveProperty('exportDate');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('favorites');
      expect(result).toHaveProperty('history');
      expect(result).toHaveProperty('notifications');
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.exportData('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateConsent', () => {
    const consentDto: ConsentDto = {
      consentGeoloc: true,
      consentCookies: true,
      consentHistory: false,
      consentVersion: '1.0',
    };

    it('should update user consent preferences', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser as User);

      await service.updateConsent('user-123', consentDto);

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          consentGeoloc: true,
          consentCookies: true,
          consentHistory: false,
          consentDate: expect.any(Date),
        }),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateConsent('unknown-id', consentDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getConsent', () => {
    it('should return user consent status', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);

      const result = await service.getConsent('user-123');

      expect(result).toHaveProperty('consentGeoloc', mockUser.consentGeoloc);
      expect(result).toHaveProperty('consentCookies', mockUser.consentCookies);
      expect(result).toHaveProperty('consentHistory', mockUser.consentHistory);
      expect(result).toHaveProperty('consentDate');
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.getConsent('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('changePassword', () => {
    const changePasswordDto: ChangePasswordDto = {
      currentPassword: 'old-password',
      newPassword: 'new-password123',
      confirmPassword: 'new-password123',
    };

    it('should update password when current password is valid', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser as User);

      const result = await service.changePassword(
        'user-123',
        changePasswordDto,
      );

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: ['id', 'passwordHash'],
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        changePasswordDto.currentPassword,
        'hashed-old-password',
      );
      expect(bcrypt.hash).toHaveBeenCalledWith(
        changePasswordDto.newPassword,
        12,
      );
      expect(result).toEqual({ message: 'Mot de passe mis à jour' });
    });

    it('should throw UnauthorizedException when current password is invalid', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-123', changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.changePassword('user-123', changePasswordDto),
      ).rejects.toThrow('Mot de passe actuel incorrect');
    });

    it('should throw UnauthorizedException when new password and confirmation do not match', async () => {
      const dtoWithMismatch: ChangePasswordDto = {
        ...changePasswordDto,
        confirmPassword: 'different-password',
      };

      await expect(
        service.changePassword('user-123', dtoWithMismatch),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.changePassword('user-123', dtoWithMismatch),
      ).rejects.toThrow('Les nouveaux mots de passe ne correspondent pas');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.changePassword('unknown-id', changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDto: ForgotPasswordDto = {
      email: 'test@example.com',
    };

    it('should send reset email when user exists', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest
        .spyOn(resetTokenRepo, 'create')
        .mockReturnValue({ id: 'token-123' } as PasswordResetToken);
      jest
        .spyOn(resetTokenRepo, 'save')
        .mockResolvedValue({ id: 'token-123' } as PasswordResetToken);

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: forgotPasswordDto.email },
      });
      expect(resetTokenRepo.create).toHaveBeenCalled();
      expect(resetTokenRepo.save).toHaveBeenCalled();
      expect(mailService.send).toHaveBeenCalled();
      expect(result.message).toContain('Si un compte existe');
    });

    it('should return generic message when user does not exist', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: forgotPasswordDto.email },
      });
      expect(mailService.send).not.toHaveBeenCalled();
      expect(result.message).toContain('Si un compte existe');
    });

    it('should return generic message when mail service is not configured', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(mailService, 'isConfigured').mockReturnValue(false);

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(mailService.send).not.toHaveBeenCalled();
      expect(result.message).toContain('Si un compte existe');
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      const mockToken: Partial<PasswordResetToken> = {
        id: 'token-123',
        userId: 'user-123',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: undefined,
      };
      jest
        .spyOn(resetTokenRepo, 'findOne')
        .mockResolvedValue(mockToken as PasswordResetToken);
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser as User);
      jest
        .spyOn(resetTokenRepo, 'save')
        .mockResolvedValue({ ...mockToken, usedAt: new Date() } as PasswordResetToken);

      const result = await service.resetPassword({
        token: 'valid-token',
        newPassword: 'new-password123',
        confirmPassword: 'new-password123',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('valid-token', 'hashed-token');
      expect(userRepo.save).toHaveBeenCalled();
      expect(result.message).toBe('Mot de passe réinitialisé avec succès');
    });

    it('should throw when passwords do not match', async () => {
      await expect(
        service.resetPassword({
          token: 'valid-token',
          newPassword: 'new-password123',
          confirmPassword: 'different-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when token is expired', async () => {
      const expiredToken: Partial<PasswordResetToken> = {
        id: 'token-123',
        userId: 'user-123',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        usedAt: undefined,
      };
      jest
        .spyOn(resetTokenRepo, 'findOne')
        .mockResolvedValue(expiredToken as PasswordResetToken);

      await expect(
        service.resetPassword({
          token: 'valid-token',
          newPassword: 'new-password123',
          confirmPassword: 'new-password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user if exists', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser as User);

      const result = await service.validateUser('user-123');

      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      const result = await service.validateUser('unknown-id');

      expect(result).toBeNull();
    });
  });
});
