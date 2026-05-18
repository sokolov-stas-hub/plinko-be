import { ApiPropertyOptional } from '@nestjs/swagger';

export class BetSeedRef {
  /** SHA-256 commitment of the active server seed at the time of the bet. */
  serverSeedHash!: string;
  /** Client seed (user-supplied or default) at the time of the bet. */
  clientSeed!: string;
  /** Nonce used for this bet. */
  nonce!: number;
}

export class BetResponse {
  /** Bet UUID. */
  betId!: string;
  /** Bet amount in minimal units (string). */
  amount!: string;
  /** Number of peg rows for this bet (8..16). */
  rows!: number;
  /** Risk profile applied. */
  risk!: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Ball path as L/R characters. Length === rows. */
  path!: string;
  /** Landing bucket index (0..rows). */
  bucketIndex!: number;
  /** Multiplier value applied (decimal as string). */
  multiplier!: string;
  /** Computed payout in minimal units (string). */
  payout!: string;
  /** User balance after this bet (string). */
  balanceAfter!: string;
  /** ISO 8601 timestamp (omitted on POST /bets response). */
  createdAt?: string;
  @ApiPropertyOptional({ type: () => BetSeedRef })
  seed?: BetSeedRef;
}

export class BetListResponse {
  items!: BetResponse[];
  /** Cursor (last item id) to fetch the next page; null when no more pages. */
  nextCursor!: string | null;
}
