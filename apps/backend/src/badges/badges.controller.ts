import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BadgesService } from './badges.service';

@Controller('badges')
@UseGuards(AuthGuard('jwt'))
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get()
  async getBadges(@Request() req: { user: { id: string } }) {
    return this.badgesService.getBadges(req.user.id);
  }
}
