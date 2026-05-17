export interface JwtAccessPayload {
  sub: string;
  type: 'access';
}
export interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}
export interface AuthUser {
  id: string;
}
