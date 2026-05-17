export type Risk = 'LOW' | 'MEDIUM' | 'HIGH';
export const RISKS: Risk[] = ['LOW', 'MEDIUM', 'HIGH'];
export const MIN_ROWS = 8;
export const MAX_ROWS = 16;

export interface PlayResult {
  path: ('L' | 'R')[];
  bucketIndex: number;
  multiplier: number;
}
