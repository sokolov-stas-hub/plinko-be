import { sha256 } from './tokens';

describe('tokens.sha256', () => {
  it('produces deterministic 64-char hex', () => {
    const a = sha256('abc');
    const b = sha256('abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
