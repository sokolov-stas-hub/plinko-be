import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgres://x',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    MIN_BET: '1000000',
    MAX_BET: '1000000000000',
    PORT: '3000',
    NODE_ENV: 'test',
    AVATAR_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    AVATAR_STORAGE_REGION: 'auto',
    AVATAR_STORAGE_BUCKET: 'plinko-avatars',
    AVATAR_STORAGE_ACCESS_KEY_ID: 'key',
    AVATAR_STORAGE_SECRET_ACCESS_KEY: 'secret',
    AVATAR_PUBLIC_BASE_URL: 'https://cdn.example.com',
  };

  it('accepts a valid env', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('rejects missing JWT secrets', () => {
    const rest: Record<string, unknown> = { ...base };
    delete rest.JWT_ACCESS_SECRET;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('coerces numeric strings', () => {
    const v = validateEnv(base);
    expect(typeof v.PORT).toBe('number');
    expect(typeof v.MIN_BET).toBe('bigint');
    expect(v.MIN_BET).toBe(1_000_000n);
  });

  it('requires avatar storage configuration', () => {
    const valid = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      MIN_BET: '1000000',
      MAX_BET: '1000000000000',
      PORT: '3000',
      NODE_ENV: 'test',
      AVATAR_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      AVATAR_STORAGE_REGION: 'auto',
      AVATAR_STORAGE_BUCKET: 'plinko-avatars',
      AVATAR_STORAGE_ACCESS_KEY_ID: 'key',
      AVATAR_STORAGE_SECRET_ACCESS_KEY: 'secret',
      AVATAR_PUBLIC_BASE_URL: 'https://cdn.example.com',
    };

    expect(validateEnv(valid).AVATAR_STORAGE_BUCKET).toBe('plinko-avatars');
    expect(() => validateEnv({ ...valid, AVATAR_STORAGE_BUCKET: '' })).toThrow(
      /Env validation failed/,
    );
  });
});
