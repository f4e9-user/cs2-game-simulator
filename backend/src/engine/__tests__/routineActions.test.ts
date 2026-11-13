import { describe, expect, it } from 'vitest';
import { applyChoice, createSession, initPlayer } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import {
  recordRoutineAction,
  replayLastWeekRoutineActions,
  rolloverRoutineActions,
} from '../routineActions.js';
import type { EventDef, EventSequence, Player, Teammate } from '../../types.js';

function player(overrides: Partial<Player> = {}): Player {
  return {
    ...initPlayer({
      name: 'RoutineTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    }),
    stats: {
      agility: 10,
      intelligence: 10,
      mentality: 10,
      experience: 10,
      constitution: 10,
      money: 20,
    },
    round: 8,
    year: 1,
    week: 8,
    stage: 'rookie',
    actionPoints: 100,
    ...overrides,
  };
}

function teammate(id: string, overrides: Partial<Teammate> = {}): Teammate {
  return {
    id,
    name: id,
    role: 'Support',
    personality: 'supportive',
    traits: ['steady'],
    stats: {
      agility: 10,
      intelligence: 10,
      mentality: 10,
      experience: 10,
    },
    growthSpent: 0,
    chemistry: 55,
    ...overrides,
  };
}

function teamPlayer(overrides: Partial<Player> = {}): Player {
  return player({
    stage: 'pro',
    team: {
      clubId: 'club-local-wolves',
      name: '本地狼队',
      tag: 'LW',
      region: '本地',
      tier: 'youth',
      monthlySalary: 30,
      joinedRound: 1,
    },
    roster: [
      teammate('slot-1', { role: 'IGL' }),
      teammate('slot-2', { role: 'AWPer' }),
      teammate('slot-3'),
      teammate('slot-4'),
    ],
    visibleTeamIdentity: 'caller',
    ...overrides,
  });
}

describe('routine action replay', () => {
  it('records current-week routine actions in execution order and rolls them into last week', () => {
    const afterRanked = recordRoutineAction(player(), 'action-ranked-grind');
    const afterTraining = recordRoutineAction(afterRanked, 'action-structured-training');

    expect(afterTraining.currentWeekRoutineActions).toEqual([
      'action-ranked-grind',
      'action-structured-training',
    ]);

    const nextWeek = rolloverRoutineActions(afterTraining);
    expect(nextWeek.lastWeekRoutineActions).toEqual([
      'action-ranked-grind',
      'action-structured-training',
    ]);
    expect(nextWeek.currentWeekRoutineActions).toEqual([]);
  });

  it('replays last-week routine actions in order and stops at the first failed action', () => {
    const session = createSession(player({
      actionPoints: 40,
      lastWeekRoutineActions: ['action-meditation', 'action-fitness'],
      currentWeekRoutineActions: [],
    }), 1);

    const replay = replayLastWeekRoutineActions(session);

    expect(replay.actionResults.map((result) => result.actionId)).toEqual(['action-meditation']);
    expect(replay.stopped).toEqual({
      index: 1,
      actionId: 'action-fitness',
      reason: '行动力不足',
    });
    expect(replay.player.actionPoints).toBe(25);
    expect(replay.player.currentWeekRoutineActions).toEqual(['action-meditation']);
  });

  it('replays last-week team management actions together with routine actions', () => {
    const session = createSession(teamPlayer({
      actionPoints: 100,
      lastWeekRoutineActions: ['team-meeting', 'team-training-focus:tactics', 'action-meditation'],
      currentWeekRoutineActions: [],
    }), 1);

    const replay = replayLastWeekRoutineActions(session);

    expect(replay.teamActionResults.map((result) => result.actionId)).toEqual([
      'team-meeting',
      'team-training-focus',
    ]);
    expect(replay.actionResults.map((result) => result.actionId)).toEqual(['action-meditation']);
    expect(replay.player.currentWeekRoutineActions).toEqual([
      'team-meeting',
      'team-training-focus:tactics',
      'action-meditation',
    ]);
  });

  it('rolls current-week actions into last-week actions when an event advances the week', () => {
    const weeklyEvent: EventDef = {
      id: 'routine-rollover-event',
      type: 'daily',
      title: 'Routine rollover',
      narrative: 'Routine rollover narrative',
      stages: ['rookie', 'youth', 'second', 'pro'],
      difficulty: 0,
      choices: [{
        id: 'continue',
        label: '继续',
        description: '进入下一周',
        check: { primary: 'mentality', dc: 0 },
        success: { narrative: 'advanced' },
        failure: { narrative: 'advanced' },
      }],
    };
    const base = createSession(player({
      currentWeekRoutineActions: ['action-ranked-grind', 'action-meditation'],
      lastWeekRoutineActions: ['action-rest-day'],
    }), 1);
    const sequence: EventSequence = {
      id: 'routine-rollover-sequence',
      type: 'test-sequence',
      currentIndex: 0,
      startedRound: base.player.round,
      mustCompleteInCurrentRound: true,
      status: 'active',
      context: {},
      steps: [{
        id: 'routine-rollover-step',
        generatedEvent: weeklyEvent,
        completeSequenceAfter: true,
      }],
    };

    const result = applyChoice({
      ...base,
      phase: 'event',
      currentEvent: toPublicEvent(weeklyEvent),
      activeEventSequence: sequence,
    }, 'continue');

    expect(result.session.player.week).toBe(9);
    expect(result.session.player.lastWeekRoutineActions).toEqual([
      'action-ranked-grind',
      'action-meditation',
    ]);
    expect(result.session.player.currentWeekRoutineActions).toEqual([]);
  });
});
