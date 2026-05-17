import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { PAYOUT_TABLES } from './payout-tables';
import { MAX_ROWS, MIN_ROWS, RISKS } from './types';

@ApiTags('game')
@Controller('game/config')
export class GameConfigController {
  constructor(private readonly cfg: ConfigService) {}

  @Get()
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
