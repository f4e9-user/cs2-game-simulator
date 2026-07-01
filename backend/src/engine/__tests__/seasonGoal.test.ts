import { describe, expect, it } from 'vitest';
import { createSession, initPlayer } from '../gameEngine.js';
import { evaluateGoalProgress, generateSeasonGoal, settleSeasonGoal } from '../seasonGoal.js';
import type { ClubRuntimeState, GameSession } from '../../types.js';
import { previewClubRuntime } from '../worldClubs.js';

function session(clubId = 'club-meteor-prime'): GameSession {
  const player = initPlayer({
    name: 'GoalTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return createSession({
    ...player,
    stage: 'pro',
    fame: 40,
    tierParticipations: {},
    tierChampionships: {},
    team: {
      clubId,
      name: 'Goal Club',
      tag: 'GL',
      region: '欧洲',
      tier: 'top',
      monthlySalary: 100,
      joinedRound: 1,
    },
  }, 1);
}

describe('season goals', () => {
  it('generates archetype-sensitive goals with a season baseline', () => {
    const capitalGoal = generateSeasonGoal(session('club-meteor-prime'), 'club-meteor-prime', 1);
    const factoryGoal = generateSeasonGoal(session('club-cyber-academy'), 'club-cyber-academy', 1);

    expect(['major-qualification', 'reach-s-event']).toContain(capitalGoal.type);
    expect(['develop-rookie', 'reach-a-main']).toContain(factoryGoal.type);
    expect(capitalGoal.baseline.startYear).toBe(1);
    expect(capitalGoal.status).toBe('active');
  });

  it('tracks tournament progress from baseline deltas', () => {
    const base = session('club-cyber-academy');
    const goal = {
      ...generateSeasonGoal(base, 'club-cyber-academy', 1),
      type: 'reach-a-main' as const,
      targetTier: 'a' as const,
      baseline: {
        tierParticipations: { a: 1 },
        tierChampionships: {},
        vrsScore: 0,
        startYear: 1,
      },
    };
    const progressed = {
      ...base,
      player: {
        ...base.player,
        tierParticipations: { a: 2 },
      },
    };

    expect(evaluateGoalProgress(progressed, previewClubRuntime(progressed, 'club-cyber-academy'), goal).progress).toBe(1);
    expect(evaluateGoalProgress(base, previewClubRuntime(base, 'club-cyber-academy'), goal).progress).toBe(0);
  });

  it('raises rebuild pressure more harshly for low-tolerance capital clubs', () => {
    const capital = session('club-meteor-prime');
    const factory = session('club-cyber-academy');
    const capitalRuntime = previewClubRuntime(capital, 'club-meteor-prime') as ClubRuntimeState;
    const factoryRuntime = previewClubRuntime(factory, 'club-cyber-academy') as ClubRuntimeState;
    const capitalGoal = { ...generateSeasonGoal(capital, 'club-meteor-prime', 1), progress: 0 };
    const factoryGoal = { ...generateSeasonGoal(factory, 'club-cyber-academy', 1), progress: 0 };

    expect(settleSeasonGoal(capital, capitalRuntime, capitalGoal).rebuildPressureDelta)
      .toBeGreaterThan(settleSeasonGoal(factory, factoryRuntime, factoryGoal).rebuildPressureDelta);
  });
});
