import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // REGISTER NEW USER
  async register(registerDto: RegisterDto) {
    // Check if user already exists
    try {
      const existingUser = await this.userModel.findOne({
        email: registerDto.email,
      });
      if (existingUser)
        throw new ConflictException('User with this email already exists');

      // Hash Password before saving
      const hashedPassword = await bcrypt.hash(registerDto.password, 10);
      const newUser = new this.userModel({
        ...registerDto,
        password: hashedPassword,
      });

      // Exclude password from returned user object
      const { password, refreshTokens, ...userWithOutPasswordAndTokens } = (
        await newUser.save()
      ).toObject();
      return {
        message: 'User Registered Successfully',
        user: userWithOutPasswordAndTokens,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      // Log the actual error for debugging
      console.error('Registration error:', error);
      throw new InternalServerErrorException('Failed to register user');
    }
  }

  // VALIDATE USER (Used by LocalStrategy)
  // Checks if email and password are correct
  async validateUser(email: string, password: string): Promise<any> {
    // Find user by email
    const user = await this.userModel.findOne({ email });
    if (!user) return null; // User not found

    // Compare provided password with hashed in DB
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null; // wrong password

    // Return user withhout password and refresh tokens
    const {
      password: _,
      refreshTokens,
      ...userWithOutPasswordAndTokens
    } = user.toObject();
    return userWithOutPasswordAndTokens;
  }

  // Calculate Expiration Date
  // Converts '7d', '15m' to actual date object
  private calculateExpirationDate(expiresIn: string): Date {
    const now = new Date();
    const unit = expiresIn.slice(-1); // 'd', 'h', 'm'
    const value = parseInt(expiresIn.slice(0, -1), 10);

    switch (unit) {
      case 'd': // days
        return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
      case 'h': // hours
        return new Date(now.getTime() + value * 60 * 60 * 1000);
      case 'm': // minutes
        return new Date(now.getTime() + value * 60 * 1000);
      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Default 7 days
    }
  }

  // LOGIN (Generate Tokens)
  // Create Access tokens and refresh tokens
  async login(user: any, deviceInfo?: string) {
    // Create JWT payload
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };

    // Generate accecc token(short-lived: 15 minutes)
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION'),
    });

    // Generate refresh token (long-lived: 7 days), Used to get new access tokens when expires
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
    });

    // calculate expiration date for refresh token
    // parse '7d' to actual date

    const expiresIn = this.configService.get('JWT_REFRESH_EXPIRATION');
    const expirationDate = this.calculateExpirationDate(expiresIn);

    // Store refresh token in database
    await this.userModel.findByIdAndUpdate(user._id, {
      $push: {
        refreshTokens: {
          token: refreshToken,
          createdAt: new Date(),
          expiresAt: expirationDate,
          deviceInfo: deviceInfo || 'Unknown Device',
        },
      },
      lastLogin: new Date(),
    });
    // Return tokens and user Info
    return {
      message: 'Login Successful',
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email, role: user.role, bio: user.bio },
    };
  }

  // Generate new access token using refresh token
  async refreshTokens(user: any, oldRefreshToken: string) {
    // create new access token
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };

    // Generate access token(short-lived: 15 minutes)
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION'),
    });

    // Refresh token rotation which is optional but extra secure which means invalidate old token and create new one
    const newRefreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
    });

    const expiresIn = this.configService.get('JWT_REFRESH_EXPIRATION');
    const expirationDate = this.calculateExpirationDate(expiresIn);

    // Remove old refresh token and add new one which implements refresh token rotation
    await this.userModel.findByIdAndUpdate(user._id, {
      $pull: { refreshTokens: { token: oldRefreshToken } },
    }); // Remove old token
    // Add new token
    await this.userModel.findByIdAndUpdate(user._id, {
      $push: {
        refreshTokens: {
          token: newRefreshToken,
          createdAt: new Date(),
          expiresAt: expirationDate,
          deviceInfo: user.refreshTokens?.[0]?.deviceInfo || 'Unknown device',
        },
      },
    });
    return { accessToken, refreshToken: newRefreshToken }; // Return new refresh token
  }

  // LOGOUT (SINGLE DEVICE)
  async logout(userId: string, refreshToken: string) {
    // Remove the refresh token from the user's refreshTokens array
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: { token: refreshToken } },
    });
    return { message: 'Logged out successfully' };
  }

  // LOGOUT ALL DEVICES
  // Remove all refresh tokens for user
  async logoutAllDevices(userId: string) {
    // Invalidate all sessions on all devices
    await this.userModel.findByIdAndUpdate(userId, {
      $set: { refreshTokens: [] },
    });

    return { message: 'Logged out from all devices successfully' };
  }

  // GET USER PROFILE
  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshTokens')
      .populate('posts')
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Clean Expired Token
  async cleanExpiredTokens() {
    await this.userModel.updateMany(
      {},
      {
        $pull: {
          refreshTokens: {
            expiresAt: { $lt: new Date() }, // Remove tokens where expiresAt < now
          },
        },
      },
    );
    return { message: 'Expired tokens cleaned successfully' };
  }
}
