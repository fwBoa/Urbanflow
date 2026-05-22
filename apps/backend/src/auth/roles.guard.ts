import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from './user.entity';

// ─── Decorator for role-based access control ──────────────────────────────

export const ROLES_KEY = 'roles';

export function Roles(...roles: string[]) {
  return (target: any, key: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(ROLES_KEY, roles, descriptor.value);
      return descriptor;
    }
    // Class decorator fallback
    Reflect.defineMetadata(ROLES_KEY, roles, target);
    return target;
  };
}

// ─── Guard that checks user has required role ─────────────────────────────

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required → allow access
    }

    const request = context.switchToHttp().getRequest();
    const user: User | null = request.user;

    if (!user) {
      return false; // No user in request → not authenticated
    }

    return requiredRoles.some((role) => user.role === role);
  }
}
