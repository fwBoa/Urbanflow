import { ConfigService } from '@nestjs/config';

/**
 * Resolve the JWT signing secret from configuration.
 *
 * In production the secret MUST be provided via the JWT_SECRET env var —
 * a missing secret is a fatal startup error (otherwise tokens would be
 * signed with a publicly-known default, enabling auth bypass).
 *
 * In development we fall back to a fixed value so the app can boot without
 * configuration, but this value is never used in production.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: JWT_SECRET environment variable must be set in production',
      );
    }
    return 'dev_only_secret';
  }
  return secret;
}