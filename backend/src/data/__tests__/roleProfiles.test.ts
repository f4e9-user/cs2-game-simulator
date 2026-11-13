import { describe, expect, it } from 'vitest';
import { ROLE_PROFILES, roleFitScore } from '../roleProfiles.js';
import { initPlayer } from '../../engine/gameEngine.js';
import type { Player } from '../../types.js';

function basePlayer(overrides: Partial<Player> = {}): Player {
  const player = initPlayer({
    name: 'Role Fit Tester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return {
    ...player,
    stage: 'second',
    team: {
      clubId: 'club-role-test',
      name: '角色测试队',
      tag: 'RLT',
      region: '测试',
      tier: 'semi-pro',
      monthlySalary: 20,
      joinedRound: 1,
    },
    roster: null,
    preferredRole: 'Entry',
    activeRole: 'Entry',
    activeRoleRounds: 8,
    ...overrides,
  };
}

describe('role profiles', () => {
  it('defines every role without money as a scoring stat', () => {
    expect(ROLE_PROFILES).toHaveLength(5);
    expect(ROLE_PROFILES.flatMap((profile) => [
      ...profile.primaryStats,
      ...profile.secondaryStats,
    ])).not.toContain('money');
  });

  it('keeps role fit score stable when only money changes', () => {
    const rich = basePlayer({
      stats: {
        agility: 12,
        intelligence: 12,
        mentality: 12,
        experience: 12,
        constitution: 10,
        money: 999,
      },
    });
    const broke = {
      ...rich,
      stats: {
        ...rich.stats,
        money: -999,
      },
    };

    expect(roleFitScore(rich, 'IGL')).toBe(roleFitScore(broke, 'IGL'));
  });

  it('clamps role fit score to a 0-100 range', () => {
    const extreme = basePlayer({
      traits: ['tactical', 'igl', 'steady', 'support'],
      activeRole: 'IGL',
      activeRoleRounds: 999,
      stats: {
        agility: 100,
        intelligence: 100,
        mentality: 100,
        experience: 100,
        constitution: 10,
        money: 0,
      },
    });

    expect(roleFitScore(extreme, 'IGL')).toBe(100);
  });
});
