import { play } from './engine';
import { PAYOUT_TABLES } from './payout-tables';
import { RISKS } from './types';

describe('Plinko engine', () => {
  const seed = 'a'.repeat(64);
  const client = 'client';

  it('produces a path of length === rows', () => {
    const r = play(seed, client, 0, 10, 'HIGH');
    expect(r.path).toHaveLength(10);
    r.path.forEach((c) => expect(['L', 'R']).toContain(c));
  });

  it('bucketIndex equals count of R', () => {
    const r = play(seed, client, 7, 12, 'MEDIUM');
    const rCount = r.path.filter((c) => c === 'R').length;
    expect(r.bucketIndex).toBe(rCount);
  });

  it('multiplier matches payout table at bucketIndex', () => {
    const r = play(seed, client, 3, 16, 'LOW');
    expect(r.multiplier).toBe(PAYOUT_TABLES.LOW[16][r.bucketIndex]);
  });

  it('is deterministic', () => {
    const a = play(seed, client, 42, 10, 'HIGH');
    const b = play(seed, client, 42, 10, 'HIGH');
    expect(a).toEqual(b);
  });

  it('differs across nonces', () => {
    const a = play(seed, client, 1, 10, 'HIGH');
    const b = play(seed, client, 2, 10, 'HIGH');
    expect(a.path.join('')).not.toEqual(b.path.join(''));
  });

  it('rejects out-of-range rows', () => {
    expect(() => play(seed, client, 0, 7, 'LOW')).toThrow();
    expect(() => play(seed, client, 0, 17, 'LOW')).toThrow();
  });

  it('all risks/rows configured in payout tables', () => {
    for (const risk of RISKS) {
      for (let rows = 8; rows <= 16; rows++) {
        expect(PAYOUT_TABLES[risk][rows]).toHaveLength(rows + 1);
      }
    }
  });

  it('distribution sanity: 50000 plays produce a bell-curve centred around rows/2', () => {
    const counts = new Array(11).fill(0);
    for (let n = 0; n < 50000; n++) {
      counts[play(seed, client, n, 10, 'HIGH').bucketIndex]++;
    }
    // Centre bucket must be the modal one for 10 rows.
    const maxIdx = counts.indexOf(Math.max(...counts));
    expect(maxIdx).toBe(5);
  });
});
