import { describeLevel, levelForXp, xpForLevel } from './level-curve';

describe('level curve', () => {
  it('uses a quadratic total XP curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(400);
    expect(xpForLevel(4)).toBe(900);
  });

  it('describes XP progress within the current level', () => {
    expect(levelForXp(240)).toBe(2);
    expect(describeLevel(240)).toEqual({
      level: 2,
      xp: 240,
      xpForCurrentLevel: 100,
      xpForNextLevel: 400,
      xpIntoCurrentLevel: 140,
    });
  });
});
