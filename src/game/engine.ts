import { createHmac } from 'crypto';
import { PAYOUT_TABLES } from './payout-tables';
import { MAX_ROWS, MIN_ROWS, PlayResult, Risk } from './types';

export function play(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number,
  risk: Risk,
): PlayResult {
  if (!Number.isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
    throw new Error(`rows must be integer in [${MIN_ROWS}, ${MAX_ROWS}]`);
  }
  if (!Number.isInteger(nonce) || nonce < 0) {
    throw new Error('nonce must be non-negative integer');
  }

  const hmac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest();

  const path: ('L' | 'R')[] = [];
  for (let i = 0; i < rows; i++) {
    path.push(hmac[i] < 128 ? 'L' : 'R');
  }
  const bucketIndex = path.reduce((n, c) => n + (c === 'R' ? 1 : 0), 0);
  const multiplier = PAYOUT_TABLES[risk][rows][bucketIndex];
  return { path, bucketIndex, multiplier };
}
