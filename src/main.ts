import { NestFactory, Reflector } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_INTERVAL = 5000; // 5 seconds

async function bootstrap(retryCount = 0) {
  const logger = new Logger('Bootstrap');

  try {
    logger.log('Starting NestJS application...');

    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    // Enable validation pipe globally
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    // Cookie parser middleware
    app.use(cookieParser());

    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector));

    // Set a global API prefix
    app.setGlobalPrefix('api');

    // Enable CORS for all origins (adjust options for production)
    app.enableCors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Enable shutdown hooks (important for graceful shutdown)
    app.enableShutdownHooks();

    const PORT = process.env.PORT ?? 3000;
    await app.listen(PORT);

    logger.log(`🚀 Server is running on http://localhost:${PORT}/api`);
    logger.log(
      `🌍 Environment: ${process.env.NODE_ENV || 'development'} on Port: ${PORT}`,
    );
    logger.log(`📊 Database: Connected`);
  } catch (error) {
    logger.error('❌ Failed to start the application');
    logger.error(`Error: ${error.message}`);

    if (retryCount < MAX_RETRY_ATTEMPTS) {
      logger.warn(
        `Retrying server start in ${RETRY_INTERVAL / 1000} seconds... (Attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`,
      );
      await delay(RETRY_INTERVAL);
      return bootstrap(retryCount + 1);
    } else {
      logger.error(
        '❌ Max retry attempts reached. Could not start the server.',
      );
      process.exit(1);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = new Logger('UncaughtException');
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const logger = new Logger('UnhandledRejection');
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  const logger = new Logger('SIGTERM');
  logger.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  const logger = new Logger('SIGINT');
  logger.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

bootstrap();
