import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
// Protects the auth/refresh endpoint and allow requests with valid refresh tokens
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  // custom error handling
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    if (err || !user)
      throw (
        err || new UnauthorizedException('Invalid or expired refresh token')
      );
    return user;
  }
}
