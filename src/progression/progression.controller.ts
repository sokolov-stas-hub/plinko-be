import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { AuthUser } from '../auth/types';
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
}
