import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RewardSource } from '@prisma/client';
import { ProgressionResponse } from './progression.response';

export class ClaimedRewardResponse {
  /** Reward source that produced this claim. */
  @ApiProperty({ enum: RewardSource, example: RewardSource.DAILY_BONUS })
  source!: RewardSource;
  /** Concrete period or mission key used for idempotency. */
  sourceKey!: string;
  /** UTC period key for the claim. */
  periodKey!: string;
  /** Claimed mission progress row id, for mission rewards. */
  @ApiPropertyOptional()
  missionId?: string;
  /** Claimed mission key, for mission rewards. */
  @ApiPropertyOptional()
  missionKey?: string;
  /** Credits in minimal units. Serialized as string because it can exceed Number.MAX_SAFE_INTEGER. */
  @ApiProperty({ type: String, example: '500000000' })
  credits!: bigint;
  /** Experience points awarded. */
  xp!: number;
  /** User balance after applying this reward. Serialized as string because it can exceed Number.MAX_SAFE_INTEGER. */
  @ApiProperty({ type: String, example: '10500000000' })
  balanceAfter!: bigint;
  /** User level before applying the reward XP. */
  levelBefore!: number;
  /** User level after applying the reward XP. */
  levelAfter!: number;
}

export class ClaimRewardResponse {
  @ApiProperty({ type: () => ClaimedRewardResponse })
  reward!: ClaimedRewardResponse;
  @ApiProperty({ type: () => ProgressionResponse })
  progression!: ProgressionResponse;
}
