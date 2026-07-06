import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  const config = (value: string | undefined) =>
    ({ get: () => value }) as unknown as ConfigService;

  it('returns the configured secret when present', () => {
    expect(resolveJwtSecret(config('super-secret'))).toBe('super-secret');
  });

  it('throws in production when JWT_SECRET is missing', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => resolveJwtSecret(config(undefined))).toThrow(/JWT_SECRET/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('falls back to the dev default outside production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      expect(resolveJwtSecret(config(undefined))).toBe('dev_only_secret');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
