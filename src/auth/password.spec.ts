import { hashPassword, verifyPassword } from './password';

describe('password helpers', () => {
  it('hashes and verifies correctly', async () => {
    const h = await hashPassword('hunter22');
    expect(h).not.toBe('hunter22');
    expect(await verifyPassword('hunter22', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
});
