import { describe, expect, it } from 'vitest';
import type { Player, Teammate } from '../../types.js';
import { initPlayer } from '../gameEngine.js';
import {
  derivePlayerIdentityScores,
  derivePlayerTeamIdentities,
  deriveTeammateIdentityScores,
  deriveTeammateIdentities,
  findTeamCaller,
  findTeamStar,
  refreshVisibleTeamIdentities,
} from '../teamIdentity.js';

function teammate(overrides: Partial<Teammate>): Teammate {
  return {
    id: overrides.id ?? 'slot-1',
    name: overrides.name ?? '队友',
    role: overrides.role ?? 'Support',
    personality: overrides.personality ?? 'supportive',
    traits: overrides.traits ?? ['support'],
    stats: overrides.stats ?? {
      agility: 5,
      intelligence: 5,
      mentality: 5,
      experience: 5,
    },
    growthSpent: 0,
    chemistry: overrides.chemistry ?? 50,
    ...overrides,
  };
}

function player(roster: Teammate[]): Player {
  const p = initPlayer({
    name: 'IdentityTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return {
    ...p,
    stats: {
      agility: 13,
      intelligence: 12,
      mentality: 10,
      experience: 12,
      constitution: 10,
      money: 20,
    },
    fame: 85,
    activeRole: 'IGL',
    preferredRole: 'IGL',
    roster,
  };
}

describe('team identities', () => {
  it('derives teammate caller and star identities from role, traits, and stats', () => {
    const caller = teammate({
      id: 'caller',
      role: 'IGL',
      traits: ['igl', 'tactical'],
      stats: { agility: 5, intelligence: 9, mentality: 7, experience: 9 },
    });
    const star = teammate({
      id: 'star',
      role: 'AWPer',
      personality: 'star',
      traits: ['aimer', 'mechanical', 'ego'],
      stats: { agility: 10, intelligence: 5, mentality: 6, experience: 7 },
    });
    const roster = [caller, star, teammate({ id: 'support' })];

    expect(deriveTeammateIdentities(caller, roster)).toContain('caller');
    expect(deriveTeammateIdentities(star, roster)).toContain('star');
    expect(findTeamCaller(player(roster), roster)?.identities).toContain('caller');
    expect(findTeamStar(player(roster), roster)?.identities).toContain('star');

    const callerScore = deriveTeammateIdentityScores(caller, roster).find((score) => score.identity === 'caller');
    const playerStarScore = derivePlayerIdentityScores(player(roster), roster).find((score) => score.identity === 'star');
    expect(callerScore?.score).toBeGreaterThanOrEqual(4);
    expect(callerScore?.reasons).toContain('IGL 角色');
    expect(playerStarScore?.reasons).toContain('名气达到核心水平');
  });

  it('refreshes visible identities without storing score details', () => {
    const roster = [
      teammate({ id: 'caller', role: 'IGL', traits: ['igl'] }),
      teammate({ id: 'glue', personality: 'supportive', traits: ['support', 'steady'], chemistry: 75 }),
    ];
    const refreshed = refreshVisibleTeamIdentities(player(roster), true);

    expect(derivePlayerTeamIdentities(refreshed, refreshed.roster ?? [])).toEqual(expect.arrayContaining(['caller', 'star']));
    expect(refreshed.visibleTeamIdentity).toBe('star-caller');
    expect(refreshed.roster?.some((tm) => tm.visibleIdentity === 'caller')).toBe(true);
    expect(refreshed.roster?.some((tm) => tm.visibleIdentity === 'glue')).toBe(true);
  });
});
