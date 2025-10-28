import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import type { Request, Response } from 'express';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // REGISTER A NEW USER
  // POST /auth/register
  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // LOGIN A NEW USER
  // POST /auth/login
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @CurrentUser() user: any,
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Generate token
    const {
      accessToken,
      refreshToken,
      user: userData,
    } = await this.authService.login(user, loginDto.deviceInfo);

    // Set tokens as htpOnly cookies
    this.setAuthCookies(res, accessToken, refreshToken);
    return {
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: userData,
    };
  }

  // POST /auth/refresh
  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Generate new tokens
    const { accessToken, refreshToken } = await this.authService.refreshTokens(
      user,
      user.refreshToken,
    );

    // Update cookies with new token
    this.setAuthCookies(res, accessToken, refreshToken);
    return {
      message: 'Tokens refreshed successfully',
      accessToken,
      refreshToken,
    };
  }

  // LOGOUT FROM A DEVICE
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Extract refresh token from cookie or header
    const refreshToken =
      req.cookies?.['refresh_token'] ||
      req.get('authorization')?.replace('Bearer', '').trim();
    if (refreshToken) await this.authService.logout(user._id, refreshToken);
    // clear cookies
    this.clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  // LOG OUT FROM ALL DEVICES
  // POST /auth/logout-all
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAllDevices(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Remove all refresh token for this user
    await this.authService.logoutAllDevices(user._id);
    // clear coookies
    this.clearAuthCookies(res);
    return { message: 'Logged out from all devices successfully' };
  }

  // GET USER PROFILE
  // GET /auth/profile
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user._id);
  }

  // GET ME TO CHECK IF USER IS AUTHENTICATED
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@CurrentUser() user: any) {
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      bio: user.bio,
    };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    // Set cookies option
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'prod', // Only HTTPS in production
      sameSite: 'strict' as const,
      path: '/',
    };

    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes in milliseconds
    });

    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }
}
