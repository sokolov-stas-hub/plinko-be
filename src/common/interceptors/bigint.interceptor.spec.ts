import { BigIntInterceptor } from './bigint.interceptor';
import { of, lastValueFrom } from 'rxjs';

describe('BigIntInterceptor', () => {
  const run = async (payload: unknown) => {
    const interceptor = new BigIntInterceptor();
    const handler = { handle: () => of(payload) } as any;
    return lastValueFrom(interceptor.intercept({} as any, handler));
  };

  it('stringifies BigInt values recursively', async () => {
    const result = await run({ a: 10n, b: { c: [1n, 2n] }, d: 'x' });
    expect(result).toEqual({ a: '10', b: { c: ['1', '2'] }, d: 'x' });
  });

  it('preserves Date and Buffer instances', async () => {
    const d = new Date('2026-01-01T00:00:00Z');
    const b = Buffer.from('hi');
    const result = (await run({ createdAt: d, blob: b, amount: 5n })) as Record<string, unknown>;
    expect(result.createdAt).toBe(d);
    expect(result.blob).toBe(b);
    expect(result.amount).toBe('5');
  });
});
