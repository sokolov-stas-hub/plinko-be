import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { SeedsService } from './seeds.service';
import { UpdateClientSeedDto } from './dto/update-client-seed.dto';
import { RotateSeedDto } from './dto/rotate-seed.dto';

@Controller('seeds')
@UseGuards(JwtAccessGuard)
export class SeedsController {
  constructor(private readonly seeds: SeedsService) {}

  @Get('active')
  active(@CurrentUser() u: AuthUser) {
    return this.seeds.getActiveForUser(u.id);
  }

  @Post('client')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateClient(@CurrentUser() u: AuthUser, @Body() dto: UpdateClientSeedDto) {
    await this.seeds.updateClientSeed(u.id, dto.clientSeed);
  }

  @Post('rotate')
  rotate(@CurrentUser() u: AuthUser, @Body() dto: RotateSeedDto) {
    return this.seeds.rotate(u.id, dto.newClientSeed);
  }

  @Get(':id')
  reveal(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.seeds.reveal(u.id, id);
  }
}
