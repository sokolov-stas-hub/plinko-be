import { assertValidNickname, defaultNicknameBase } from './nickname';

describe('nickname helpers', () => {
  it('normalizes email prefix into a safe default base', () => {
    expect(defaultNicknameBase('Demo.User+tag@test.local')).toBe('Demo_User_tag');
    expect(defaultNicknameBase('@@@test.local')).toBe('player');
  });

  it('accepts only 3-20 ASCII letters, digits, and underscore', () => {
    expect(() => assertValidNickname('abc_123')).not.toThrow();
    expect(() => assertValidNickname('ab')).toThrow(/3 to 20/);
    expect(() => assertValidNickname('name-with-dash')).toThrow(/letters, digits, and underscore/);
  });
});
