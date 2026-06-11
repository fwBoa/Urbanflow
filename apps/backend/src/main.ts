import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Préfixe API
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 UrbanFlow API running on http://localhost:${port}`);
}
bootstrap();
