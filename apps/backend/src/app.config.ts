import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * Configuration partagée de l'application NestJS (routing, validation, filtre
 * d'exceptions, cookies). Utilisée à la fois par le bootstrap (`main.ts`) et
 * par les tests e2e, afin que ces derniers exercent les VRAIES routes
 * préfixées `/api` plutôt qu'une application « nue » au routing différent.
 *
 * OWASP : le `ValidationPipe` (whitelist + forbidNonWhitelisted) valide toutes
 * les entrées ; le filtre rédige les détails internes en production ; les
 * cookies httpOnly portent le JWT.
 */
export function applyAppConfig(app: INestApplication): void {
  // ─── OWASP A07: Parse cookies for httpOnly JWT ───
  app.use(cookieParser());

  // ─── Validation globale des DTOs (OWASP: input validation) ───
  // production: suppress detailed validation messages to the client.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  // ─── Global exception filter: redact internals only in production ───
  app.useGlobalFilters(new AllExceptionsFilter());

  // Préfixe API global
  app.setGlobalPrefix('api');
}