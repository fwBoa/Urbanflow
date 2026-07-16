import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RolesGuard, Roles, ROLES_KEY } from './roles.guard';
import { User } from './user.entity';

const createMockExecutionContext = (user?: User) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: jest.fn().mockReturnValue(function handler() {}),
    getClass: jest.fn().mockReturnValue(class TestController {}),
  }) as any;

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockExecutionContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when required roles array is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = createMockExecutionContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when user is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockExecutionContext(undefined);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies access when user role does not match', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const user = { id: 'user-1', role: 'user' } as User;
    const context = createMockExecutionContext(user);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows access when user role matches one of the required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['admin', 'moderator']);
    const user = { id: 'user-1', role: 'admin' } as User;
    const context = createMockExecutionContext(user);
    expect(guard.canActivate(context)).toBe(true);
  });
});

describe('Roles decorator', () => {
  it('sets metadata on method handler', () => {
    class Controller {
      @Roles('admin')
      handler() {}
    }
    const meta = Reflect.getMetadata(ROLES_KEY, Controller.prototype.handler);
    expect(meta).toEqual(['admin']);
  });

  it('sets metadata on class when used as class decorator', () => {
    @Roles('admin', 'moderator')
    class Controller {}
    const meta = Reflect.getMetadata(ROLES_KEY, Controller);
    expect(meta).toEqual(['admin', 'moderator']);
  });
});
