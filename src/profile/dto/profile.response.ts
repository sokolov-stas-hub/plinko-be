import { ApiProperty } from '@nestjs/swagger';

export class ProfileProgressionSummary {
  /** Current progression level. */
  level!: number;
  /** Current experience points. */
  xp!: number;
  /** Consecutive daily claims. */
  dailyStreak!: number;
}

export class ProfileResponse {
  /** Unique user id (UUID v4). */
  id!: string;
  /** Email used at registration. */
  email!: string;
  /** Public display name. */
  nickname!: string;
  /** Public avatar URL, or null before upload. */
  avatarUrl!: string | null;
  /** Balance in minimal units. Serialized as string because it can exceed Number.MAX_SAFE_INTEGER. */
  @ApiProperty({ type: String, example: '10000000000' })
  balance!: bigint;
  @ApiProperty({ type: () => ProfileProgressionSummary })
  progression!: ProfileProgressionSummary;
}
