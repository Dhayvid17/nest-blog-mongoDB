import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  // This code decides whether to allow or block the request oon all routes
  // This is the main guard so we apply it GLOBALLY to all routes
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // check if route is marked as @Public(), if yes, skip authentication
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // check method level decorator
      context.getClass(), // check controller level decorator
    ]);
    if (isPublic) return true; // Skip authentication for public routes
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    // If there is an error or no User found
    if (err || !user)
      throw err || new UnauthorizedException('Invalid or expired access token');
    // Authentication successful, return user
    return user;
  }
}
