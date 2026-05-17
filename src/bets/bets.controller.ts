import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { BetsService } from './bets.service';
import { CreateBetDto } from './dto/create-bet.dto';
import { ListBetsQuery } from './dto/list-bets.query';

@Controller('bets')
@UseGuards(JwtAccessGuard)
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Post()
  place(@CurrentUser() u: AuthUser, @Body() dto: CreateBetDto) {
    return this.bets.placeBet(u.id, dto.amount, dto.rows, dto.risk);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListBetsQuery) {
    return this.bets.list(u.id, q);
  }

  @Get(':id')
  getOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bets.getById(u.id, id);
  }
}
