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
  };

  it('accepts a valid env', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('rejects missing JWT secrets', () => {
    const { JWT_ACCESS_SECRET, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('coerces numeric strings', () => {
    const v = validateEnv(base);
    expect(typeof v.PORT).toBe('number');
    expect(typeof v.MIN_BET).toBe('bigint');
    expect(v.MIN_BET).toBe(1_000_000n);
  });
});
