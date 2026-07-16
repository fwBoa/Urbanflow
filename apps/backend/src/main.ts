import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { applyAppConfig } from './app.config';
import helmet from 'helmet';

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

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: loggerLevels });
  const logger = new Logger('Bootstrap');

  // ─── OWASP: Security headers (§5.5 Dossier Technique) ───
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: [
            "'self'",
            'data:',
            'https://*.tile.openstreetmap.org',
            'https://*.openstreetmap.org',
          ],
          connectSrc: [
            "'self'",
            'http://localhost:3001',
            'https://prim.iledefrance-mobilites.fr',
            'https://router.project-osrm.org',
            'https://api-adresse.data.gouv.fr',
          ],
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

  // ─── Routing, validation, filtre d'exceptions, cookies, préfixe /api ───
  // (partagé avec les tests e2e — voir src/app.config.ts)
  applyAppConfig(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 UrbanFlow API running on http://0.0.0.0:${port} [${nodeEnv}]`);
}
export function runBootstrap() {
  return bootstrap().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Bootstrap failed:', err.message);
    process.exit(1);
  });
}

void runBootstrap();
