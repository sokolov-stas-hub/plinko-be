import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { UsersService } from './users.service';
import { UserResponse } from './dto/user.response';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAccessGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated user profile and balance' })
  @ApiOkResponse({ type: UserResponse })
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
