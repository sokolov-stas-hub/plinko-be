import { MissionStatus, MissionType, RewardSource } from '@prisma/client';

export type ProgressionReward = {
  credits: bigint;
  xp: number;
};

export type ProgressionDaily = {
  canClaim: boolean;
  streak: number;
  nextClaimAt: string;
  reward: ProgressionReward;
};

export type ProgressionMission = {
  key: string;
  type: MissionType;
  title: string;
  description: string;
  target: number;
  progress: number;
  status: MissionStatus;
  reward: ProgressionReward;
  completedAt: string | null;
  claimedAt: string | null;
};

export type ProgressionAggregate = {
  level: number;
  xp: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpIntoCurrentLevel: number;
  daily: ProgressionDaily;
  missions: {
    daily: ProgressionMission[];
    starter: ProgressionMission[];
  };
};

export type ClaimedReward = {
  source: RewardSource;
  sourceKey: string;
  periodKey: string;
  credits: bigint;
  xp: number;
  balanceAfter: bigint;
};

export type ClaimRewardAggregate = {
  reward: ClaimedReward;
  progression: ProgressionAggregate;
};
