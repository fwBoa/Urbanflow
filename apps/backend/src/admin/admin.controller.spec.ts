import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: AdminService;

  const mockAdminService = {
    getDashboardStats: jest.fn(),
    getAllUsers: jest.fn(),
    getUserById: jest.fn(),
    deleteUser: jest.fn(),
    getAllTrips: jest.fn(),
    getAllNotifications: jest.fn(),
    broadcastNotification: jest.fn(),
    reloadGtfs: jest.fn(),
    getGtfsStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('should return dashboard stats', async () => {
      const mockStats = {
        totals: { users: 50, trips: 200, notifications: 30, co2SavedKg: 5.2 },
        breakdown: { usersByRole: { user: 50 }, tripsByMode: { metro: 100 } },
        activity: { newUsersLast7Days: 5, tripsLast7Days: 20 },
      };
      mockAdminService.getDashboardStats.mockResolvedValue(mockStats);

      const result = await controller.getDashboard();

      expect(adminService.getDashboardStats).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const users = [{ id: 'user-1', email: 'test@example.com' }];
      mockAdminService.getAllUsers.mockResolvedValue(users);

      const result = await controller.getAllUsers();

      expect(adminService.getAllUsers).toHaveBeenCalled();
      expect(result).toEqual(users);
    });
  });

  describe('getUserById', () => {
    it('should return user detail', async () => {
      const user = { id: 'user-1', email: 'test@example.com', tripCount: 5 };
      mockAdminService.getUserById.mockResolvedValue(user);

      const result = await controller.getUserById('user-1');

      expect(adminService.getUserById).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(user);
    });

    it('should throw HttpException if user not found', async () => {
      mockAdminService.getUserById.mockResolvedValue(null);

      await expect(controller.getUserById('unknown-id')).rejects.toThrow(
        HttpException,
      );
      await expect(controller.getUserById('unknown-id')).rejects.toThrow(
        'Utilisateur non trouvé',
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete user and return message', async () => {
      mockAdminService.deleteUser.mockResolvedValue({
        message: 'Utilisateur supprimé (soft delete)',
      });

      const result = await controller.deleteUser('user-1');

      expect(adminService.deleteUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ message: 'Utilisateur supprimé' });
    });
  });

  describe('getAllTrips', () => {
    it('should return paginated trips with defaults', async () => {
      const trips = { data: [], total: 0, limit: 50, offset: 0 };
      mockAdminService.getAllTrips.mockResolvedValue(trips);

      const result = await controller.getAllTrips({});

      expect(adminService.getAllTrips).toHaveBeenCalledWith(50, 0);
      expect(result).toEqual(trips);
    });

    it('should use provided limit and offset', async () => {
      const trips = { data: [], total: 0, limit: 20, offset: 10 };
      mockAdminService.getAllTrips.mockResolvedValue(trips);

      const result = await controller.getAllTrips({ limit: 20, offset: 10 });

      expect(adminService.getAllTrips).toHaveBeenCalledWith(20, 10);
      expect(result).toEqual(trips);
    });
  });

  describe('getAllNotifications', () => {
    it('should return all notifications', async () => {
      const notifications = [{ id: 'notif-1', title: 'Alert' }];
      mockAdminService.getAllNotifications.mockResolvedValue(notifications);

      const result = await controller.getAllNotifications();

      expect(adminService.getAllNotifications).toHaveBeenCalled();
      expect(result).toEqual(notifications);
    });
  });

  describe('broadcastNotification', () => {
    it('should broadcast notification and return count', async () => {
      mockAdminService.broadcastNotification.mockResolvedValue(50);

      const body = {
        title: 'Maintenance',
        message: 'Métro fermé',
        type: 'disruption',
      };
      const result = await controller.broadcastNotification(body);

      expect(adminService.broadcastNotification).toHaveBeenCalledWith(body);
      expect(result).toEqual({ message: 'Notification envoyée', count: 50 });
    });
  });

  describe('reloadGtfs', () => {
    it('should reload GTFS and return success', async () => {
      mockAdminService.reloadGtfs.mockResolvedValue({ loaded: true });

      const result = await controller.reloadGtfs();

      expect(adminService.reloadGtfs).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Données GTFS rechargées',
      });
    });

    it('should throw HttpException on reload failure', async () => {
      mockAdminService.reloadGtfs.mockRejectedValue(new Error('Network error'));

      await expect(controller.reloadGtfs()).rejects.toThrow(HttpException);
    });
  });

  describe('getGtfsStatus', () => {
    it('should return GTFS status', async () => {
      const status = { loaded: true, stats: { stops: 100 } };
      mockAdminService.getGtfsStatus.mockResolvedValue(status);

      const result = await controller.getGtfsStatus();

      expect(adminService.getGtfsStatus).toHaveBeenCalled();
      expect(result).toEqual(status);
    });
  });
});
