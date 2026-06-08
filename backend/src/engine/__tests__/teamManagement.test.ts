import { describe, expect, it } from 'vitest';
import {
  applyTeamMeeting,
  applyTeamPractice,
  createSession,
  initPlayer,
} from '../gameEngine.js';
import type { Player, PlayerTeam, Teammate } from '../../types.js';

function team(): PlayerTeam {
  return {
    clubId: 'club-local-wolves',
    name: '本地狼队',
    tag: 'LW',
    region: '本地',
    tier: 'youth',
    monthlySalary: 10,
    joinedRound: 1,
  };
}

function teammate(id: string, role: Teammate['role']): Teammate {
  return {
    id,
    name: `队友${id}`,
    role,
    personality: 'supportive',
    traits: ['support'],
    stats: {
      agility: 5,
      intelligence: 5,
      mentality: 5,
      experience: 5,
    },
    growthSpent: 0,
    chemistry: 40,
  };
}

function player(): Player {
  const p = initPlayer({
    name: 'TeamTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return {
    ...p,
    stats: {
      agility: 10,
      intelligence: 10,
      mentality: 10,
      experience: 10,
      constitution: 10,
      money: 20,
    },
    stage: 'youth',
    round: 10,
    year: 1,
    week: 10,
    team: team(),
    roster: [
      teammate('slot-1', 'AWPer'),
      teammate('slot-2', 'IGL'),
      teammate('slot-3', 'Support'),
    ],
    teamTrust: 40,
  };
}

describe('team management actions', () => {
  it('limits teammate practice to two total sessions per week', () => {
    const session = createSession(player(), 1);
    const first = applyTeamPractice(session, 'slot-1');
    const second = applyTeamPractice({ ...session, player: first.player }, 'slot-2');

    expect(second.player.weeklyTeamActions['practice:slot-1']?.count).toBe(1);
    expect(second.player.weeklyTeamActions['practice:slot-2']?.count).toBe(1);
    expect(second.player.roster?.find((tm) => tm.id === 'slot-1')?.chemistry).toBeGreaterThan(40);
    expect(() => applyTeamPractice({ ...session, player: second.player }, 'slot-3'))
      .toThrow('本周队友加练次数已达上限');
  });

  it('adds tactical-ready buff when team meeting succeeds', () => {
    const session = createSession(player(), 1);
    const result = applyTeamMeeting(session);

    expect(result.result.success).toBe(true);
    expect(result.player.buffs.some((buff) => buff.id === 'team-tactical-ready')).toBe(true);
    expect(result.player.roster?.every((tm) => tm.chemistry === 42)).toBe(true);
    expect(result.player.weeklyTeamActions['team-meeting']).toEqual({ year: 1, week: 10, count: 1 });
  });
});
