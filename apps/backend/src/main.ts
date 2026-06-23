import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './all-exceptions.filter';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

// ─── 3-tier log levels (driven by NODE_ENV) ───────────────────────────────
//   development → full verbosity (debug/log/warn/error)
//   staging     → operational only (log/warn/error) — enough to diagnose a RC
//   production  → operational only (log/warn/error), errors redacted by filter
const LOG_LEVELS: Record<string, ('log' | 'debug' | 'warn' | 'error')[]> = {
  development: ['debug', 'log', 'warn', 'error'],
  staging: ['log', 'warn', 'error'],
  production: ['log', 'warn', 'error'],
};
const nodeEnv = process.env.NODE_ENV ?? 'development';
const loggerLevels = LOG_LEVELS[nodeEnv] ?? LOG_LEVELS.development;
const isProd = nodeEnv === 'production';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: loggerLevels });
  const logger = new Logger('Bootstrap');

  // ─── OWASP A07: Parse cookies for httpOnly JWT ───
  app.use(cookieParser());

  // ─── OWASP: Security headers (§5.5 Dossier Technique) ───
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://*.openstreetmap.org"],
          connectSrc: ["'self'", "http://localhost:3001", "https://prim.iledefrance-mobilites.fr", "https://router.project-osrm.org", "https://api-adresse.data.gouv.fr", "https://gbfs*.lime.bike", "https://gbfs*.dott.co", "https://gbfs*.voi.com"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ─── CORS — configured for dev and production ───
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3001'];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    maxAge: 3600, // Preflight cache 1h
  });

  // ─── Validation globale des DTOs (OWASP: input validation) ───
  // production: suppress detailed validation messages to the client.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: isProd,
    }),
  );

  // ─── Global exception filter: redact internals only in production ───
  app.useGlobalFilters(new AllExceptionsFilter());

  // Préfixe API
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 UrbanFlow API running on http://0.0.0.0:${port} [${nodeEnv}]`);
}
bootstrap();
