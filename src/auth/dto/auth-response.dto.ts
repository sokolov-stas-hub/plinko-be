export class UserSummary {
  /** Unique user id (UUID v4). */
  id!: string;
  /** Email used at registration. */
  email!: string;
}

export class TokensResponse {
  /** Short-lived JWT (15 min). Sent as `Authorization: Bearer <token>`. */
  accessToken!: string;
  /** Long-lived JWT (7 days). Used to refresh access token. */
  refreshToken!: string;
}

export class AuthResponse extends TokensResponse {
  user!: UserSummary;
}
