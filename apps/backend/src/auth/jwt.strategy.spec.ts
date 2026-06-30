import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { User } from './user.entity';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: jest.Mocked<AuthService>;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed',
    displayName: 'Test',
    preferredMode: 'rapide',
    accessibilityNeeds: false,
    avatar: '🚇',
    role: 'user',
    consentGeoloc: true,
    consentCookies: false,
    consentHistory: false,
    consentDate: null,
    consentVersion: '',
    notificationsEnabled: true,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    authService = {
      validateUser: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: authService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user payload for valid token', async () => {
      authService.validateUser.mockResolvedValue(mockUser);
      const payload = { sub: 'user-123', email: 'test@example.com' };

      const result = await strategy.validate(payload);

      expect(authService.validateUser).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({ id: 'user-123', email: 'test@example.com', role: 'user' });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      authService.validateUser.mockResolvedValue(null);
      const payload = { sub: 'unknown', email: 'unknown@example.com' };

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });
  });
});
