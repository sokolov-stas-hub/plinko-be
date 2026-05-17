import { addDuration } from './duration';

describe('addDuration', () => {
  const base = new Date('2026-01-01T00:00:00Z');
  it.each([
    ['15m', 15 * 60 * 1000],
    ['7d', 7 * 86400 * 1000],
    ['2h', 2 * 3600 * 1000],
    ['30s', 30 * 1000],
  ])('parses %s', (expr, expected) => {
    expect(addDuration(base, expr).getTime() - base.getTime()).toBe(expected);
  });

  it('throws on invalid', () => {
    expect(() => addDuration(base, 'oops')).toThrow();
  });
});
