import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  // This method is automatically called by Passport, It receives email and password from login reuest
  // LocalAuthGuard triggers this strategy, validate User and If Valid, User object is attach to req.user
  async validate(email: string, password: string): Promise<any> {
    // call auth service to verify credentials
    const user = await this.authService.validateUser(email, password);

    if (!user) throw new UnauthorizedException('Invalid email or password');
    return user;
  }
}
