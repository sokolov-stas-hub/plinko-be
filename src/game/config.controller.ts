import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PAYOUT_TABLES } from './payout-tables';
import { MAX_ROWS, MIN_ROWS, RISKS } from './types';
import { GameConfigResponse } from './dto/game-config.response';

@ApiTags('game')
@Controller('game/config')
export class GameConfigController {
  constructor(private readonly cfg: ConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get allowed rows, risks, bet limits, and payout tables' })
  @ApiOkResponse({ type: GameConfigResponse })
  get() {
    const rows: number[] = [];
    for (let r = MIN_ROWS; r <= MAX_ROWS; r++) rows.push(r);
    return {
      rows,
      risks: RISKS,
      minBet: this.cfg.get<bigint>('MIN_BET'),
      maxBet: this.cfg.get<bigint>('MAX_BET'),
      payoutTables: PAYOUT_TABLES,
    };
  }
}
