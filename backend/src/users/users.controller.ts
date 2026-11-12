import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/decorators/current-user/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.users.profile(user.userId);
  }
}
