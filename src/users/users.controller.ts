import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAccessGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.users.findById(u.id);
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      email: user.email,
      balance: user.balance,
      createdAt: user.createdAt,
    };
  }
}
