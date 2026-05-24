import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { AuthUser } from '../auth/types';
import { ProfileResponse } from './dto/profile.response';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth('access-token')
@Controller('profile')
@UseGuards(JwtAccessGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated player profile' })
  @ApiOkResponse({ type: ProfileResponse })
  getMe(@CurrentUser() u: AuthUser) {
    return this.profile.getMe(u.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated player profile' })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiBadRequestResponse({ description: 'Invalid nickname' })
  @ApiConflictResponse({ description: 'Nickname already taken' })
  updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.updateMe(u.id, dto);
  }
}
