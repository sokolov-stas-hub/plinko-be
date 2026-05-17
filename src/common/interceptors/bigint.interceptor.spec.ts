import { BigIntInterceptor } from './bigint.interceptor';
import { of, lastValueFrom } from 'rxjs';

describe('BigIntInterceptor', () => {
  it('stringifies BigInt values recursively', async () => {
    const interceptor = new BigIntInterceptor();
    const handler = { handle: () => of({ a: 10n, b: { c: [1n, 2n] }, d: 'x' }) } as any;
    const result = await lastValueFrom(interceptor.intercept({} as any, handler));
    expect(result).toEqual({ a: '10', b: { c: ['1', '2'] }, d: 'x' });
  });
});
