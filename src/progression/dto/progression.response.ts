import { ApiProperty } from '@nestjs/swagger';

export class ProgressionRewardResponse {
  /** Credits in minimal units. Serialized as string because it can exceed Number.MAX_SAFE_INTEGER. */
  @ApiProperty({ type: String, example: '500000000' })
  credits!: bigint;
  /** Experience points awarded. */
  xp!: number;
}

export class ProgressionDailyResponse {
  /** Whether the current user can claim today's daily bonus. */
  canClaim!: boolean;
  /** Current consecutive daily claim streak. */
  streak!: number;
  /** ISO 8601 timestamp when the next daily bonus window opens. */
  nextClaimAt!: string;
  @ApiProperty({ type: () => ProgressionRewardResponse })
  reward!: ProgressionRewardResponse;
}

export class ProgressionMissionResponse {
  /** User mission progress row id. */
  id!: string | null;
  /** Stable mission key. */
  key!: string;
  /** Mission cadence. */
  type!: 'DAILY' | 'STARTER';
  /** User-facing mission title. */
  title!: string;
  /** User-facing mission description. */
  description!: string;
  /** Required progress to complete the mission. */
  target!: number;
  /** Current progress toward the target. */
  progress!: number;
  /** Current mission state. */
  status!: 'ACTIVE' | 'COMPLETED' | 'CLAIMED';
  @ApiProperty({ type: () => ProgressionRewardResponse })
  reward!: ProgressionRewardResponse;
  /** ISO 8601 completion timestamp, or null while incomplete. */
  completedAt!: string | null;
  /** ISO 8601 claim timestamp, or null while unclaimed. */
  claimedAt!: string | null;
}

export class ProgressionMissionsResponse {
  @ApiProperty({ type: () => ProgressionMissionResponse, isArray: true })
  daily!: ProgressionMissionResponse[];
  @ApiProperty({ type: () => ProgressionMissionResponse, isArray: true })
  starter!: ProgressionMissionResponse[];
}

export class ProgressionResponse {
  /** Current progression level. */
  level!: number;
  /** Current experience points. */
  xp!: number;
  /** XP required to reach the current level. */
  xpForCurrentLevel!: number;
  /** XP required to reach the next level. */
  xpForNextLevel!: number;
  /** XP earned since reaching the current level. */
  xpIntoCurrentLevel!: number;
  @ApiProperty({ type: () => ProgressionDailyResponse })
  daily!: ProgressionDailyResponse;
  @ApiProperty({ type: () => ProgressionMissionsResponse })
  missions!: ProgressionMissionsResponse;
}
