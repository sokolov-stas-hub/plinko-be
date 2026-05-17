import { hashServerSeed, randomServerSeed, randomClientSeed } from './seeds.service';

describe('seeds helpers', () => {
  it('hashServerSeed returns 64-char hex sha256', () => {
    const h = hashServerSeed('a'.repeat(64));
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('randomServerSeed returns 64 hex chars', () => {
    expect(randomServerSeed()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('randomClientSeed returns 32 hex chars', () => {
    expect(randomClientSeed()).toMatch(/^[a-f0-9]{32}$/);
  });
});
