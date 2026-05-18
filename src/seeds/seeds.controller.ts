import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { SeedsService } from './seeds.service';
import { UpdateClientSeedDto } from './dto/update-client-seed.dto';
import { RotateSeedDto } from './dto/rotate-seed.dto';
import {
  ActiveSeedResponse,
  RevealedSeedResponse,
  RotateSeedResponse,
} from './dto/seed.response';

@ApiTags('seeds')
@ApiBearerAuth('access-token')
@Controller('seeds')
@UseGuards(JwtAccessGuard)
export class SeedsController {
  constructor(private readonly seeds: SeedsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Current active seed (commitment + client seed + nonce)' })
  @ApiOkResponse({ type: ActiveSeedResponse })
  active(@CurrentUser() u: AuthUser) {
    return this.seeds.getActiveForUser(u.id);
  }

  @Post('client')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update client seed of the active seed (only at nonce=0)' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Cannot change client seed after first bet' })
  async updateClient(@CurrentUser() u: AuthUser, @Body() dto: UpdateClientSeedDto) {
    await this.seeds.updateClientSeed(u.id, dto.clientSeed);
  }

  @Post('rotate')
  @ApiOperation({ summary: 'Reveal current seed and create a fresh ACTIVE one' })
  @ApiCreatedResponse({ type: RotateSeedResponse })
  rotate(@CurrentUser() u: AuthUser, @Body() dto: RotateSeedDto) {
    return this.seeds.rotate(u.id, dto.newClientSeed);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a revealed seed for verification (raw serverSeed)' })
  @ApiOkResponse({ type: RevealedSeedResponse })
  @ApiBadRequestResponse({ description: 'Seed is still ACTIVE; rotate first' })
  reveal(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.seeds.reveal(u.id, id);
  }
}
