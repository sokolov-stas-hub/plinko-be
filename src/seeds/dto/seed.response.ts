export class ActiveSeedResponse {
  /** SHA-256 commitment of the active server seed. */
  serverSeedHash!: string;
  /** Current client seed (user-supplied or random default). */
  clientSeed!: string;
  /** Number of bets placed against this seed so far. */
  nonce!: number;
}

export class RevealedSeedResponse {
  id!: string;
  /** Raw server seed (revealed after rotation). */
  serverSeed!: string;
  serverSeedHash!: string;
  clientSeed!: string;
  /** Highest nonce used while this seed was active. */
  nonceMax!: number;
}

export class RotateSeedResponse {
  revealed!: RevealedSeedResponse;
  newActive!: ActiveSeedResponse;
}
