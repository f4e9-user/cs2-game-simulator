import { describe, expect, it } from 'vitest';
import {
  applyChoice,
  applyRetainCoreTeammate,
  applyTeamMeeting,
  applyTeamPractice,
  applyTeamTrainingFocus,
  createSession,
  initPlayer,
} from '../gameEngine.js';
import { getEventById } from '../../data/events/index.js';
import { pickEvent, toPublicEvent } from '../events.js';
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
  it('limits teammate practice to one total session per week', () => {
    const session = createSession({ ...player(), actionPoints: 120 }, 1);
    const first = applyTeamPractice(session, 'slot-1');

    expect(first.player.weeklyTeamActions['practice:slot-1']?.count).toBe(1);
    expect(first.player.actionPoints).toBe(session.player.actionPoints - 55);
    expect(first.player.roster?.find((tm) => tm.id === 'slot-1')?.chemistry).toBeGreaterThan(40);
    expect(() => applyTeamPractice({ ...session, player: first.player }, 'slot-2'))
      .toThrow('本周队友加练次数已达上限');
  });

  it('describes teammate practice growth with display-layer attributes', () => {
    const practicePlayer = {
      ...player(),
      stats: {
        agility: 10,
        intelligence: 30,
        mentality: 10,
        experience: 30,
        constitution: 10,
        money: 20,
      },
    };

    const result = Array.from({ length: 20 }, (_, i) => {
      const session = createSession(practicePlayer, 1);
      session.id = `team-practice-display-${i}`;
      return applyTeamPractice(session, 'slot-2');
    }).find((candidate) => candidate.result.success);

    expect(result).toBeDefined();
    expect(result!.result.narrative).toContain('决策');
    expect(result!.result.effects).toContain('队友slot-2决策小幅提升');
    expect(result!.result.narrative).not.toContain('智力');
    expect(result!.result.effects.join(' / ')).not.toContain('智力');
  });

  it('adds tactical-ready buff when team meeting succeeds', () => {
    const result = Array.from({ length: 20 }, (_, i) => {
      const session = createSession({
        ...player(),
        stats: {
          agility: 10,
          intelligence: 16,
          mentality: 16,
          experience: 10,
          constitution: 10,
          money: 20,
        },
      }, 1);
      session.id = `team-meeting-ready-${i}`;
      return applyTeamMeeting(session);
    }).find((candidate) => candidate.result.success);

    expect(result).toBeDefined();
    expect(result!.result.success).toBe(true);
    expect(result!.player.buffs.some((buff) => buff.id === 'team-tactical-ready')).toBe(true);
    expect(result!.player.roster?.every((tm) => tm.chemistry === 42)).toBe(true);
    expect(result!.player.weeklyTeamActions['team-meeting']).toEqual({ year: 1, week: 10, count: 1 });
  });

  it('allows one retain attempt for a revealed core teammate departure', () => {
    const base = player();
    const session = createSession({
      ...base,
      pendingDeparture: {
        slotId: 'slot-2',
        departureRound: base.round + 5,
        rumorShown: true,
        revealed: true,
        destTeamName: '测试队',
        earlyRecruit: false,
        baseWindowStartRound: base.round - 1,
        pressure: 82,
        pressureThreshold: 100,
      },
    }, 1);

    const result = applyRetainCoreTeammate(session);

    expect(result.result.actionId).toBe('retain-core-teammate');
    expect(result.player.pendingDeparture?.retentionAttempted).toBe(true);
    expect(result.player.pendingDeparture?.retentionAttemptRound).toBe(base.round);
    expect(result.player.actionPoints).toBe(base.actionPoints - 35);
    expect(() => applyRetainCoreTeammate({ ...session, player: result.player }))
      .toThrow('这次离队风险已经尝试过挽留');
  });

  it('reduces departure pressure when a retain attempt succeeds', () => {
    const base = player();
    const result = Array.from({ length: 20 }, (_, i) => {
      const session = createSession({
        ...base,
        pendingDeparture: {
          slotId: 'slot-2',
          departureRound: base.round + 5,
          rumorShown: true,
          revealed: true,
          destTeamName: '测试队',
          earlyRecruit: false,
          baseWindowStartRound: base.round - 1,
          pressure: 82,
          pressureThreshold: 100,
        },
      }, 1);
      session.id = `retain-pressure-${i}`;
      return applyRetainCoreTeammate(session);
    }).find((candidate) => candidate.result.success);

    expect(result).toBeDefined();
    expect(result!.player.pendingDeparture?.pressure ?? 0).toBeLessThan(82);
    expect((result!.player.pendingDeparture?.lockedUntilRound ?? 0)).toBeGreaterThanOrEqual(base.round + 4);
  });

  it('lets a caller suggest a short-lived team training focus', () => {
    const base = {
      ...player(),
      stats: {
        agility: 10,
        intelligence: 16,
        mentality: 10,
        experience: 16,
        constitution: 10,
        money: 20,
      },
      activeRole: 'IGL' as const,
      preferredRole: 'IGL' as const,
      visibleTeamIdentity: 'caller' as const,
    };
    const result = Array.from({ length: 20 }, (_, i) => {
      const session = createSession(base, 1);
      session.id = `team-training-focus-${i}`;
      return applyTeamTrainingFocus(session, 'tactics');
    }).find((candidate) => candidate.result.success);

    expect(result).toBeDefined();
    expect(result!.result.success).toBe(true);
    expect(result!.player.tags).toContain('team-focus-tactics');
    expect(result!.player.tagExpiry['team-focus-tactics']).toBe(base.round + 4);
    expect(result!.player.actionPoints).toBe(base.actionPoints - 20);
  });

  it('blocks team training focus without team influence', () => {
    const base = {
      ...player(),
      traits: [],
      activeRole: null,
      preferredRole: null,
      fame: 0,
    };
    const session = createSession(base, 1);

    expect(() => applyTeamTrainingFocus(session, 'tactics')).toThrow('队内话语权');
  });

  it('opens and consumes team management combos across team actions', () => {
    const base = {
      ...player(),
      activeRole: 'IGL' as const,
      preferredRole: 'IGL' as const,
      visibleTeamIdentity: 'caller' as const,
    };
    const meeting = Array.from({ length: 20 }, (_, i) => {
      const session = createSession(base, 1);
      session.id = `team-combo-meeting-${i}`;
      return applyTeamMeeting(session);
    }).find((candidate) => candidate.result.success);

    expect(meeting).toBeDefined();
    expect(meeting!.result.success).toBe(true);
    expect(meeting!.result.comboAddedLabels).toContain('战术会议铺垫');
    expect(meeting!.player.roundCombos).toContainEqual({
      id: 'team-meeting-ready',
      label: '战术会议铺垫',
      sourceActionId: 'team-meeting',
      remainingUses: 1,
    });

    const focus = applyTeamTrainingFocus({ ...createSession(base, 1), player: meeting!.player }, 'tactics');

    expect(focus.result.comboTriggeredLabels).toContain('战术会议铺垫');
    expect(focus.player.roundCombos.some((combo) => combo.id === 'team-meeting-ready')).toBe(false);
    expect(focus.result.dc).toBeLessThan(10);
  });

  it('lets teammate practice set up the next tactical meeting only once', () => {
    const practice = Array.from({ length: 20 }, (_, i) => {
      const session = createSession(player(), 1);
      session.id = `team-practice-link-${i}`;
      return applyTeamPractice(session, 'slot-1');
    }).find((candidate) => candidate.result.success);

    expect(practice).toBeDefined();

    expect(practice!.result.success).toBe(true);
    expect(practice!.result.comboAddedLabels).toContain('配合手感延续');
    expect(practice!.player.roundCombos.some((combo) => combo.id === 'team-practice-link')).toBe(true);

    const session = createSession(player(), 1);
    const meeting = applyTeamMeeting({ ...session, player: practice!.player });

    expect(meeting.result.comboTriggeredLabels).toContain('配合手感延续');
    expect(meeting.player.roundCombos.some((combo) => combo.id === 'team-practice-link')).toBe(false);
  });

  it('prioritizes caller-star politics events when conflict risk is visible', () => {
    const star: Teammate = {
      ...teammate('star-slot', 'AWPer'),
      name: '明星队友',
      personality: 'star',
      traits: ['aimer'],
      stats: {
        agility: 13,
        intelligence: 5,
        mentality: 6,
        experience: 6,
      },
      chemistry: 30,
      visibleIdentity: 'star',
    };
    const base = {
      ...player(),
      traits: ['tactical-mind'],
      stats: {
        agility: 6,
        intelligence: 12,
        mentality: 10,
        experience: 10,
        constitution: 10,
        money: 20,
      },
      activeRole: 'IGL' as const,
      preferredRole: 'IGL' as const,
      visibleTeamIdentity: 'caller' as const,
      teamTrust: 35,
      roster: [star, teammate('support-slot', 'Support')],
    };

    const event = pickEvent({
      player: base,
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).toBe('team-politics-caller-vs-star');
  });

  it('can surface positive voice events when caller and star are aligned', () => {
    const star: Teammate = {
      ...teammate('star-slot', 'AWPer'),
      name: '明星队友',
      personality: 'star',
      traits: ['aimer'],
      stats: {
        agility: 13,
        intelligence: 5,
        mentality: 6,
        experience: 6,
      },
      chemistry: 60,
      visibleIdentity: 'star',
    };
    const caller: Teammate = {
      ...teammate('caller-slot', 'IGL'),
      name: '指挥队友',
      traits: ['igl', 'tactical'],
      stats: {
        agility: 5,
        intelligence: 12,
        mentality: 8,
        experience: 9,
      },
      chemistry: 60,
      visibleIdentity: 'caller',
    };
    const base = {
      ...player(),
      traits: ['tactical-mind'],
      activeRole: 'IGL' as const,
      preferredRole: 'IGL' as const,
      visibleTeamIdentity: 'caller' as const,
      teamTrust: 65,
      roster: [star, caller],
    };

    const event = pickEvent({
      player: base,
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).toBe('team-politics-aligned-resources');
  });

  it('can surface star resource tilt events without exposing lineup control', () => {
    const base = {
      ...player(),
      visibleTeamIdentity: 'star' as const,
      teamTrust: 42,
      consecutiveLosses: 1,
      roster: [
        teammate('support-slot', 'Support'),
        teammate('entry-slot', 'Entry'),
      ],
    };

    const event = pickEvent({
      player: base,
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).toBe('team-politics-resource-tilt');
  });

  it('surfaces lineup advice as a star-only event without granting direct roster control', () => {
    const base = {
      ...player(),
      traits: ['aim-god'],
      stats: {
        agility: 13,
        intelligence: 5,
        mentality: 8,
        experience: 5,
        constitution: 10,
        money: 20,
      },
      activeRole: null,
      preferredRole: null,
      visibleTeamIdentity: 'star' as const,
      teamTrust: 45,
      consecutiveLosses: 2,
      roster: [
        {
          ...teammate('problem-slot', 'Entry'),
          personality: 'drama' as const,
          traits: ['ego', 'solo'],
          chemistry: 20,
          visibleIdentity: 'problem' as const,
        },
        teammate('support-slot', 'Support'),
      ],
    };

    const event = pickEvent({
      player: base,
      recentEventIds: ['team-politics-resource-tilt'],
      rng: () => 0,
    });

    expect(event?.id).toBe('team-politics-lineup-advice');
    expect(event?.choices.some((choice) => choice.id === 'adjust-roles')).toBe(true);
    expect(event?.choices.some((choice) => choice.id.includes('transfer'))).toBe(false);
  });

  it('does not grant lineup advice to callers who are not stars', () => {
    const base = {
      ...player(),
      traits: ['tactical-mind'],
      activeRole: 'IGL' as const,
      preferredRole: 'IGL' as const,
      visibleTeamIdentity: 'caller' as const,
      teamTrust: 35,
      consecutiveLosses: 2,
      roster: [
        teammate('support-slot', 'Support'),
        teammate('entry-slot', 'Entry'),
      ],
    };

    const event = pickEvent({
      player: base,
      recentEventIds: ['team-politics-caller-vs-star'],
      rng: () => 0,
    });

    expect(event?.id).not.toBe('team-politics-lineup-advice');
  });

  it('can surface ordinary-player stand events without granting strategy control', () => {
    const star: Teammate = {
      ...teammate('star-slot', 'AWPer'),
      personality: 'star',
      traits: ['aimer'],
      stats: {
        agility: 13,
        intelligence: 5,
        mentality: 6,
        experience: 6,
      },
      chemistry: 30,
      visibleIdentity: 'star',
    };
    const caller: Teammate = {
      ...teammate('caller-slot', 'IGL'),
      traits: ['igl', 'tactical'],
      stats: {
        agility: 5,
        intelligence: 12,
        mentality: 8,
        experience: 9,
      },
      chemistry: 30,
      visibleIdentity: 'caller',
    };
    const base = {
      ...player(),
      traits: [],
      stats: {
        agility: 5,
        intelligence: 5,
        mentality: 8,
        experience: 5,
        constitution: 10,
        money: 20,
      },
      activeRole: null,
      preferredRole: null,
      teamTrust: 35,
      roster: [star, caller],
    };

    const event = pickEvent({
      player: base,
      recentEventIds: [],
      rng: () => 0,
    });

    expect(event?.id).toBe('team-politics-ordinary-stand');
  });

  it('can surface a harder politics choice when both core teammates push the player', () => {
    const star: Teammate = {
      ...teammate('star-slot', 'AWPer'),
      personality: 'star',
      traits: ['aimer'],
      stats: {
        agility: 13,
        intelligence: 5,
        mentality: 6,
        experience: 6,
      },
      chemistry: 30,
      visibleIdentity: 'star',
    };
    const caller: Teammate = {
      ...teammate('caller-slot', 'IGL'),
      traits: ['igl', 'tactical'],
      stats: {
        agility: 5,
        intelligence: 12,
        mentality: 8,
        experience: 9,
      },
      chemistry: 30,
      visibleIdentity: 'caller',
    };
    const base = {
      ...player(),
      traits: ['tactical-mind'],
      activeRole: 'IGL' as const,
      preferredRole: 'IGL' as const,
      visibleTeamIdentity: 'caller' as const,
      teamTrust: 35,
      consecutiveLosses: 2,
      roster: [star, caller],
    };

    const event = pickEvent({
      player: base,
      recentEventIds: [
        'team-politics-caller-vs-star',
        'team-politics-star-vs-caller',
        'team-politics-ordinary-stand',
      ],
      rng: () => 0,
    });

    expect(event?.id).toBe('team-politics-hard-choice');
  });

  it('applies team trust and target teammate chemistry effects from politics choices', () => {
    const star: Teammate = {
      ...teammate('star-slot', 'AWPer'),
      name: '明星队友',
      personality: 'star',
      traits: ['aimer'],
      stats: {
        agility: 13,
        intelligence: 5,
        mentality: 6,
        experience: 6,
      },
      chemistry: 30,
      visibleIdentity: 'star',
    };
    const caller: Teammate = {
      ...teammate('caller-slot', 'IGL'),
      name: '指挥队友',
      traits: ['igl', 'tactical'],
      stats: {
        agility: 5,
        intelligence: 12,
        mentality: 8,
        experience: 9,
      },
      chemistry: 40,
      visibleIdentity: 'caller',
    };
    const base = {
      ...player(),
      traits: ['tactical-mind'],
      activeRole: 'IGL' as const,
      preferredRole: 'IGL' as const,
      visibleTeamIdentity: 'caller' as const,
      teamTrust: 35,
      roster: [star, caller, teammate('support-slot', 'Support')],
    };
    const event = getEventById('team-politics-hard-choice')!;
    const session = createSession(base, 1);
    session.currentEvent = toPublicEvent(event, base.rivals, base.roster ?? []);

    const resolved = applyChoice(session, 'back-caller', 20);

    expect(resolved.result.eventId).toBe('team-politics-hard-choice');
    expect(resolved.session.player.teamTrust).toBe(37);
    expect(resolved.session.player.roster?.find((tm) => tm.id === 'caller-slot')?.chemistry).toBe(44);
    expect(resolved.session.player.roster?.find((tm) => tm.id === 'star-slot')?.chemistry).toBe(27);
    expect(resolved.result.passiveEffects).toContain('队伍信任 +2');
    expect(resolved.result.passiveEffects).toContain('指挥队友默契 +4');
    expect(resolved.result.passiveEffects).toContain('明星队友默契 -3');
  });

  it('promotes expiring trial or rotation status to starter with feedback', () => {
    const base = {
      ...player(),
      team: {
        ...team(),
        teamStatus: 'rotation' as const,
        teamStatusUntilRound: player().round + 1,
      },
    };
    const event = getEventById('team-role-clash')!;
    const session = createSession(base, 1);
    session.currentEvent = toPublicEvent(event, base.rivals, base.roster ?? []);

    const resolved = applyChoice(session, 'share-role', 20);

    expect(resolved.session.player.team?.teamStatus).toBe('starter');
    expect(resolved.session.player.team?.teamStatusUntilRound).toBeUndefined();
    expect(resolved.result.passiveEffects).toContain('队伍定位更新：你已进入首发名单');
  });
});
