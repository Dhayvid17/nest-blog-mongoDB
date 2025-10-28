import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { UserRole } from 'src/schemas/user.schema';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
// Restrict access to specific user roles (ADMIN, USER)
// JWT checks if user is login while RolesGuard check if the user has the required role
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [
        context.getHandler(), // check method level decorator
        context.getClass(), // check controller level decorator
      ],
    );
    if (!requiredRoles) return true;

    // Get user from request, user was attached by JwtAuthGuard
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('User not authenticated');

    // Check if user's role is in the required roles array
    const hasRoles = requiredRoles.some((role) => user.role === role);
    if (!hasRoles)
      throw new ForbiddenException(
        `Access denied. Required role(s): ${requiredRoles.join(', ')}`,
      );
    return true; // user has required role, allow access
  }
}
