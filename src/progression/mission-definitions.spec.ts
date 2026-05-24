import { DAILY_MISSION_COUNT, DAILY_MISSIONS, STARTER_MISSIONS, selectDailyMissions } from './mission-definitions';

describe('mission definitions', () => {
  it('selects exactly three deterministic daily missions', () => {
    const first = selectDailyMissions('user-1', '2026-05-24');
    const second = selectDailyMissions('user-1', '2026-05-24');

    expect(first).toEqual(second);
    expect(first).toHaveLength(DAILY_MISSION_COUNT);
    expect(new Set(first.map(m => m.key)).size).toBe(DAILY_MISSION_COUNT);
  });

  it('defines starter missions for onboarding', () => {
    expect(STARTER_MISSIONS.map(m => m.key)).toEqual([
      'first_bet',
      'first_win',
      'try_all_risks',
      'hit_5x',
      'play_25_bets',
    ]);
  });

  it('freezes exported mission definitions', () => {
    expect(Object.isFrozen(DAILY_MISSIONS)).toBe(true);
    expect(Object.isFrozen(DAILY_MISSIONS[0])).toBe(true);
    expect(Object.isFrozen(DAILY_MISSIONS[0].rule)).toBe(true);
    expect(Object.isFrozen(STARTER_MISSIONS)).toBe(true);
    expect(Object.isFrozen(STARTER_MISSIONS[0])).toBe(true);
    expect(Object.isFrozen(STARTER_MISSIONS[0].rule)).toBe(true);
  });

  it('does not let selected mission mutation corrupt definitions', () => {
    const originalSelection = selectDailyMissions('user-1', '2026-05-24');
    const originalDefinition = DAILY_MISSIONS.find(m => m.key === originalSelection[0].key);

    expect(originalDefinition).toBeDefined();

    (originalSelection[0] as { title: string }).title = 'Corrupted title';
    (originalSelection[0].rule as { kind: string }).kind = 'corrupted_rule';

    expect(selectDailyMissions('user-1', '2026-05-24')[0]).toEqual({
      ...originalSelection[0],
      title: originalDefinition?.title,
      rule: originalDefinition?.rule,
    });
    expect(originalDefinition?.title).not.toBe('Corrupted title');
    expect(originalDefinition?.rule.kind).not.toBe('corrupted_rule');
  });
});
