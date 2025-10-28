import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from 'src/schemas/user.schema';

@Injectable()
// Validate access tokens on protected routes except public routes
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private configService: ConfigService,
  ) {
    super({
      // HYBRID APPROACH: Extract JWT from cookies and If not then Authorization hearder
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => {
          // Try to extract from cookie first
          let token = null;
          if (request && request.cookies) {
            token = request.cookies['access_token'];
          }
          return token;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false, // Reject expired tokens
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'HeWhoGotGodIsNotBoundToFailInLife', // Secret to verify token
    });
  }

  // After token is verified, payload contains the data we encrypted in the token
  async validate(payload: any) {
    // Fetch user from database using ID from token, ensure user still exists and get fresh user role if changed
    const user = await this.userModel
      .findById(payload.sub)
      .select('-password -refreshTokens')
      .exec();
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }
}
