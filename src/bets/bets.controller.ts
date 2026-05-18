import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { BetsService } from './bets.service';
import { CreateBetDto } from './dto/create-bet.dto';
import { ListBetsQuery } from './dto/list-bets.query';
import { BetListResponse, BetResponse } from './dto/bet.response';

@ApiTags('bets')
@ApiBearerAuth('access-token')
@Controller('bets')
@UseGuards(JwtAccessGuard)
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Post()
  @ApiOperation({ summary: 'Place a bet (atomic balance debit + payout credit)' })
  @ApiCreatedResponse({ type: BetResponse })
  place(@CurrentUser() u: AuthUser, @Body() dto: CreateBetDto) {
    return this.bets.placeBet(u.id, dto.amount, dto.rows, dto.risk);
  }

  @Get()
  @ApiOperation({ summary: 'List the user’s bet history (cursor pagination)' })
  @ApiOkResponse({ type: BetListResponse })
  list(@CurrentUser() u: AuthUser, @Query() q: ListBetsQuery) {
    return this.bets.list(u.id, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one bet by id (must belong to the caller)' })
  @ApiOkResponse({ type: BetResponse })
  @ApiNotFoundResponse({ description: 'Bet not found' })
  @ApiForbiddenResponse({ description: 'Bet belongs to another user' })
  getOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bets.getById(u.id, id);
  }
}
