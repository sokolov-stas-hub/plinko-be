export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new Error('level must be a positive integer');
  return level === 1 ? 0 : 100 * (level - 1) * (level - 1);
}

export function levelForXp(xp: number): number {
  if (!Number.isInteger(xp) || xp < 0) throw new Error('xp must be a non-negative integer');
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

export function describeLevel(xp: number) {
  const level = levelForXp(xp);
  return {
    level,
    xp,
    xpForCurrentLevel: xpForLevel(level),
    xpForNextLevel: xpForLevel(level + 1),
    xpIntoCurrentLevel: xp - xpForLevel(level),
  };
}
