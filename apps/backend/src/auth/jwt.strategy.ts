import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { resolveJwtSecret } from './jwt-secret';

// ─── OWASP A07: Extract JWT from httpOnly cookie (fallback: Authorization header) ───
function extractJwtFromCookieOrHeader(req: Request): string | null {
  // Priority 1: httpOnly cookie
  const cookieToken = req.cookies?.urbanflow_token;
  if (cookieToken) return cookieToken;
  // Priority 2: Authorization Bearer header (backward compat)
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      // ─── OWASP: Require JWT_SECRET in production (see resolveJwtSecret) ───
      secretOrKey: resolveJwtSecret(configService),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    // `role` est requis par RolesGuard (endpoints admin @Roles('admin')).
    // Sans lui, request.user ne porte que { id, email } → 403 systématique
    // sur toute route administrée, bien que l'utilisateur soit authentifié.
    return { id: payload.sub, email: payload.email, role: user.role };
  }
}