export class UserResponse {
  /** Unique user id (UUID v4). */
  id!: string;
  /** Email used at registration. */
  email!: string;
  /** Balance in minimal units (1 credit = 1_000_000). Serialized as string because it can exceed Number.MAX_SAFE_INTEGER. */
  balance!: string;
  /** ISO 8601 timestamp. */
  createdAt!: string;
}
