import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Delete,
  UseGuards,
  Request as ReqDecorator,
  Res,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, UpdateProfileDto, ConsentDto } from './auth.dto';

// ─── OWASP A07: JWT httpOnly cookie config ───
const COOKIE_NAME = 'urbanflow_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 2 * 60 * 60 * 1000, // 2h — matches JWT expiry
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── OWASP: 5 registrations per minute max (brute-force prevention) ───
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const authResponse = await this.authService.register(dto);
    res.cookie(COOKIE_NAME, authResponse.access_token, COOKIE_OPTIONS);
    return { user: authResponse.user };
  }

  // ─── OWASP: 5 login attempts per minute max (credential stuffing prevention) ───
  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const authResponse = await this.authService.login(dto);
    res.cookie(COOKIE_NAME, authResponse.access_token, COOKIE_OPTIONS);
    return { user: authResponse.user };
  }

  // ─── OWASP: Clear httpOnly cookie on logout ───
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { message: 'Déconnecté' };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@ReqDecorator() req: { user: { id: string } }) {
    return this.authService.getProfile(req.user.id);
  }

  @Put('me')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(
    @ReqDecorator() req: { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  // ─── RGPD: Droit à l'effacement (Art. 17) ───
  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  async deleteAccount(@ReqDecorator() req: { user: { id: string } }) {
    return this.authService.deleteAccount(req.user.id);
  }

  // ─── RGPD: Droit à la portabilité (Art. 20) ───
  @Get('me/export')
  @UseGuards(AuthGuard('jwt'))
  async exportData(
    @ReqDecorator() req: { user: { id: string } },
    @Res() res: Response,
  ) {
    const data = await this.authService.exportData(req.user.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="urbanflow-data-export.json"',
    );
    res.json(data);
  }

  // ─── RGPD: Gestion du consentement (§9.2) ───
  @Post('consent')
  @UseGuards(AuthGuard('jwt'))
  async updateConsent(
    @ReqDecorator() req: { user: { id: string } },
    @Body() dto: ConsentDto,
  ) {
    return this.authService.updateConsent(req.user.id, dto);
  }

  @Get('consent')
  @UseGuards(AuthGuard('jwt'))
  async getConsent(@ReqDecorator() req: { user: { id: string } }) {
    return this.authService.getConsent(req.user.id);
  }

  // ─── Notification preferences ───
  @Put('notifications-preference')
  @UseGuards(AuthGuard('jwt'))
  async updateNotificationsPreference(
    @ReqDecorator() req: { user: { id: string } },
    @Body() body: { enabled: boolean },
  ) {
    return this.authService.updateNotificationsPreference(req.user.id, body.enabled);
  }
}