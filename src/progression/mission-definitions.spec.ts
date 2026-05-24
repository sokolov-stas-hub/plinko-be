import { DAILY_MISSION_COUNT, STARTER_MISSIONS, selectDailyMissions } from './mission-definitions';

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
});
