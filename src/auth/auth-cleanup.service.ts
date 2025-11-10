import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);
  constructor(private readonly authService: AuthService) {}

  // Run every day at 2 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTokens() {
    try {
      await this.authService.cleanExpiredTokens();
      this.logger.log(`Cleaned up expired refresh tokens`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', error);
    }
  }
}
