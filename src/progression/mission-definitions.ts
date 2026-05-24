import { createHash } from 'crypto';
import { Risk } from '../game/types';

export const DAILY_MISSION_COUNT = 3;
export type MissionKind = 'DAILY' | 'STARTER';
export type MissionRule =
  | { kind: 'count_bets' }
  | { kind: 'count_wins' }
  | { kind: 'hit_multiplier'; multiplier: number }
  | { kind: 'count_risk'; risk: Risk }
  | { kind: 'wager_credits' }
  | { kind: 'try_all_risks' };

export type MissionDefinition = {
  key: string;
  type: MissionKind;
  title: string;
  description: string;
  target: number;
  creditReward: bigint;
  xpReward: number;
  rule: MissionRule;
};

const credits = (value: number) => BigInt(value) * 1_000_000n;

export const DAILY_MISSIONS: MissionDefinition[] = [
  { key: 'place_10_bets', type: 'DAILY', title: 'Place 10 bets', description: 'Place 10 bets today.', target: 10, creditReward: credits(500), xpReward: 40, rule: { kind: 'count_bets' } },
  { key: 'win_3_bets', type: 'DAILY', title: 'Win 3 bets', description: 'Finish 3 bets with payout greater than bet amount.', target: 3, creditReward: credits(750), xpReward: 60, rule: { kind: 'count_wins' } },
  { key: 'hit_2x', type: 'DAILY', title: 'Hit 2x', description: 'Land a multiplier of 2x or higher.', target: 1, creditReward: credits(750), xpReward: 60, rule: { kind: 'hit_multiplier', multiplier: 2 } },
  { key: 'play_high_risk_5', type: 'DAILY', title: 'Play high risk 5 times', description: 'Place 5 high-risk bets today.', target: 5, creditReward: credits(600), xpReward: 50, rule: { kind: 'count_risk', risk: 'HIGH' } },
  { key: 'wager_1000_credits', type: 'DAILY', title: 'Wager 1,000 credits', description: 'Wager a total of 1,000 credits today.', target: 1000, creditReward: credits(1500), xpReward: 100, rule: { kind: 'wager_credits' } },
];

export const STARTER_MISSIONS: MissionDefinition[] = [
  { key: 'first_bet', type: 'STARTER', title: 'First bet', description: 'Place your first bet.', target: 1, creditReward: credits(500), xpReward: 50, rule: { kind: 'count_bets' } },
  { key: 'first_win', type: 'STARTER', title: 'First win', description: 'Win your first bet.', target: 1, creditReward: credits(750), xpReward: 75, rule: { kind: 'count_wins' } },
  { key: 'try_all_risks', type: 'STARTER', title: 'Try all risks', description: 'Place a bet on low, medium, and high risk.', target: 3, creditReward: credits(1000), xpReward: 100, rule: { kind: 'try_all_risks' } },
  { key: 'hit_5x', type: 'STARTER', title: 'Hit 5x', description: 'Land a multiplier of 5x or higher.', target: 1, creditReward: credits(1500), xpReward: 150, rule: { kind: 'hit_multiplier', multiplier: 5 } },
  { key: 'play_25_bets', type: 'STARTER', title: 'Play 25 bets', description: 'Place 25 total bets.', target: 25, creditReward: credits(2000), xpReward: 200, rule: { kind: 'count_bets' } },
];

export function selectDailyMissions(userId: string, periodKey: string): MissionDefinition[] {
  return [...DAILY_MISSIONS]
    .sort((a, b) => score(userId, periodKey, a.key).localeCompare(score(userId, periodKey, b.key)))
    .slice(0, DAILY_MISSION_COUNT);
}

function score(userId: string, periodKey: string, missionKey: string): string {
  return createHash('sha256').update(`${userId}:${periodKey}:${missionKey}`).digest('hex');
}
