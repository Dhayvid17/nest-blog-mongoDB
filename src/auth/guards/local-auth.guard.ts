import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  // Extracts email & password from request body and passes them to LocalStrategy
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ): TUser {
    // custom error handling
    if (err || !user)
      throw err || new UnauthorizedException('Invalid email or password');
    return user;
  }
}
