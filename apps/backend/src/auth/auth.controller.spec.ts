import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  UpdateProfileDto,
  ConsentDto,
} from './auth.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockResponse = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    setHeader: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    deleteAccount: jest.fn(),
    exportData: jest.fn(),
    updateConsent: jest.fn(),
    getConsent: jest.fn(),
    updateNotificationsPreference: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    };

    const mockAuthResponse = {
      access_token: 'mock-jwt-token',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        avatar: '🚇',
        preferredMode: 'rapide',
        accessibilityNeeds: false,
        role: 'user',
      },
    };

    it('should register a new user and set cookie', async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const result = await controller.register(registerDto, mockResponse);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual({ user: mockAuthResponse.user });
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    const mockAuthResponse = {
      access_token: 'mock-jwt-token',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        avatar: '🚇',
        role: 'user',
      },
    };

    it('should login user and set cookie', async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      const result = await controller.login(loginDto, mockResponse);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual({ user: mockAuthResponse.user });
    });
  });

  describe('logout', () => {
    it('should clear auth cookie', () => {
      const result = controller.logout(mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('urbanflow_token', {
        path: '/',
      });
      expect(result).toEqual({ message: 'Déconnecté' });
    });
  });

  describe('getProfile', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatar: '🚇',
      preferredMode: 'rapide',
      accessibilityNeeds: false,
      role: 'user',
    };

    it('should return user profile', async () => {
      mockAuthService.getProfile.mockResolvedValue(mockUser);
      const req = { user: { id: 'user-123' } };

      const result = await controller.getProfile(req);

      expect(authService.getProfile).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateProfile', () => {
    const updateDto: UpdateProfileDto = {
      displayName: 'Updated Name',
      avatar: '🚲',
    };

    const mockUpdatedUser = {
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Updated Name',
      avatar: '🚲',
      role: 'user',
    };

    it('should update user profile', async () => {
      mockAuthService.updateProfile.mockResolvedValue(mockUpdatedUser);
      const req = { user: { id: 'user-123' } };

      const result = await controller.updateProfile(req, updateDto);

      expect(authService.updateProfile).toHaveBeenCalledWith(
        'user-123',
        updateDto,
      );
      expect(result).toEqual(mockUpdatedUser);
    });
  });

  describe('deleteAccount', () => {
    it('should delete user account (soft delete)', async () => {
      mockAuthService.deleteAccount.mockResolvedValue({
        message:
          'Compte supprimé. Vos données seront définitivement effacées sous 30 jours.',
      });
      const req = { user: { id: 'user-123' } };

      const result = await controller.deleteAccount(req);

      expect(authService.deleteAccount).toHaveBeenCalledWith('user-123');
      expect(result.message).toContain('30 jours');
    });
  });

  describe('exportData', () => {
    const mockExportData = {
      exportDate: new Date().toISOString(),
      user: { email: 'test@example.com' },
      favorites: [],
      history: [],
      notifications: [],
    };

    it('should export user data for GDPR portability', async () => {
      mockAuthService.exportData.mockResolvedValue(mockExportData);
      const req = { user: { id: 'user-123' } };

      await controller.exportData(req, mockResponse);

      expect(authService.exportData).toHaveBeenCalledWith('user-123');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/json',
      );
    });
  });

  describe('updateConsent', () => {
    const consentDto: ConsentDto = {
      consentGeoloc: true,
      consentCookies: true,
      consentHistory: true,
    };

    const mockUpdatedUser = {
      id: 'user-123',
      email: 'test@example.com',
      consentGeoloc: true,
      consentCookies: true,
      consentHistory: true,
      role: 'user',
    };

    it('should update user consent preferences', async () => {
      mockAuthService.updateConsent.mockResolvedValue(mockUpdatedUser);
      const req = { user: { id: 'user-123' } };

      const result = await controller.updateConsent(req, consentDto);

      expect(authService.updateConsent).toHaveBeenCalledWith(
        'user-123',
        consentDto,
      );
      expect(result).toEqual(mockUpdatedUser);
    });
  });

  describe('getConsent', () => {
    const mockConsent = {
      consentGeoloc: true,
      consentCookies: true,
      consentHistory: false,
      consentDate: new Date(),
    };

    it('should return user consent status', async () => {
      mockAuthService.getConsent.mockResolvedValue(mockConsent);
      const req = { user: { id: 'user-123' } };

      const result = await controller.getConsent(req);

      expect(authService.getConsent).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockConsent);
    });
  });

  describe('updateNotificationsPreference', () => {
    it('should update notification preferences', async () => {
      mockAuthService.updateNotificationsPreference.mockResolvedValue({
        enabled: true,
      });
      const req = { user: { id: 'user-123' } };
      const body = { enabled: true };

      const result = await controller.updateNotificationsPreference(req, body);

      expect(authService.updateNotificationsPreference).toHaveBeenCalledWith(
        'user-123',
        true,
      );
      expect(result).toEqual({ enabled: true });
    });
  });
});
