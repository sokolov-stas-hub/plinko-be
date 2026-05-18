export class GameConfigResponse {
  /** Allowed rows count for a bet (8..16 inclusive). */
  rows!: number[];
  /** Risk levels available. */
  risks!: ('LOW' | 'MEDIUM' | 'HIGH')[];
  /** Minimum allowed bet (minimal units, string). */
  minBet!: string;
  /** Maximum allowed bet (minimal units, string). */
  maxBet!: string;
  /** Multiplier tables keyed by risk then rows. */
  payoutTables!: Record<'LOW' | 'MEDIUM' | 'HIGH', Record<number, number[]>>;
}
