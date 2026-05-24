import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { AuthUser } from '../auth/types';
import { ClaimRewardResponse } from './dto/claim-reward.response';
import { ProgressionResponse } from './dto/progression.response';
import { ProgressionService } from './progression.service';

@ApiTags('progression')
@ApiBearerAuth('access-token')
@Controller('progression')
@UseGuards(JwtAccessGuard)
export class ProgressionController {
  constructor(private readonly progression: ProgressionService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user progression aggregate' })
  @ApiOkResponse({ type: ProgressionResponse })
  getMe(@CurrentUser() u: AuthUser): Promise<ProgressionResponse> {
    return this.progression.getMe(u.id);
  }

  @Post('daily/claim')
  @ApiOperation({ summary: 'Claim the authenticated user daily bonus' })
  @ApiCreatedResponse({ type: ClaimRewardResponse })
  @ApiConflictResponse({ description: 'Daily bonus already claimed for the current UTC period' })
  claimDaily(@CurrentUser() u: AuthUser): Promise<ClaimRewardResponse> {
    return this.progression.claimDaily(u.id);
  }

  @Post('missions/:id/claim')
  @ApiOperation({ summary: 'Claim a completed mission reward' })
  @ApiCreatedResponse({ type: ClaimRewardResponse })
  @ApiConflictResponse({ description: 'Mission is incomplete or reward was already claimed' })
  @ApiNotFoundResponse({ description: 'Mission not found' })
  claimMission(@CurrentUser() u: AuthUser, @Param('id') id: string): Promise<ClaimRewardResponse> {
    return this.progression.claimMission(u.id, id);
  }
}
