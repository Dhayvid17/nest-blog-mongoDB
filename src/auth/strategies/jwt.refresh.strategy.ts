import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from 'src/schemas/user.schema';

@Injectable()
// Validate refresh tokens when user wants new access token(refresh token is stored in database)
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
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
            token = request.cookies['refresh_token'];
          }
          return token;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false, // Reject expired tokens
      secretOrKey:
        configService.get<string>('JWT_REFRESH_SECRET') ||
        'IAmOutOfSecretPhrasesButIStillGotThisInMe', // secret to verify token
      passReqToCallback: true, // we need access to original request to extract the raw token string and verify it in database
    });
  }

  // After refresh token is verified, validate refresh token
  // Check if token exists in DB which allows us to revoke tokens(logout) and logout all devices(clear all refresh tokens)
  async validate(req: Request, payload: any) {
    // Extract token from request and check against database
    const refreshToken =
      req.cookies?.['refresh_token'] ||
      req.get('authorization')?.replace('Bearer', '').trim();
    if (!refreshToken)
      throw new UnauthorizedException('Refresh token not found');

    // Find user and check if refresh token exists in the refreshToken array
    const user = await this.userModel
      .findOne({ _id: payload.sub, 'refreshTokens.token': refreshToken })
      .select('-password')
      .exec();
    if (!user)
      throw new UnauthorizedException(
        'Invalid refresh token or user not found',
      );

    // JWT library checks expiration but we need to double-check from DB
    const tokenData = user.refreshTokens.find(
      (rt) => rt.token === refreshToken,
    );
    if (!tokenData || tokenData.expiresAt < new Date())
      throw new UnauthorizedException('Refresh token has expired');
    // Return user with refresh token attached
    return { ...user.toObject(), refreshToken };
  }
}
