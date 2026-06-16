import { describe, expect, it } from 'vitest';
import { applyAction, applyChoice, createSession, initPlayer } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import type { EventDef, EventSequence, Player } from '../../types.js';

function event(id: string, title: string): EventDef {
  return {
    id,
    type: 'life',
    title,
    narrative: `${title} narrative`,
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 0,
    choices: [
      {
        id: 'continue',
        label: '继续',
        description: '推进流程',
        check: { primary: 'mentality', dc: 0 },
        success: { narrative: `${title} success` },
        failure: { narrative: `${title} failure` },
      },
    ],
  };
}

function player(): Player {
  return {
    ...initPlayer({
      name: 'SequenceTester',
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
    actionPoints: 75,
    stage: 'rookie',
  };
}

function sequence(events: EventDef[]): EventSequence {
  return {
    id: 'seq-test-1',
    type: 'test-sequence',
    currentIndex: 0,
    startedRound: 8,
    mustCompleteInCurrentRound: true,
    status: 'active',
    context: {},
    steps: events.map((generatedEvent, index) => ({
      id: `step-${index + 1}`,
      generatedEvent,
      completeSequenceAfter: index === events.length - 1,
    })),
  };
}

describe('event sequence', () => {
  it('keeps non-final steps in the same round and advances only after final step', () => {
    const events = [
      event('seq-step-1', 'Step 1'),
      event('seq-step-2', 'Step 2'),
      event('seq-step-3', 'Step 3'),
    ];
    const base = createSession(player(), 1);
    const session = {
      ...base,
      phase: 'event' as const,
      currentEvent: toPublicEvent(events[0]!),
      activeEventSequence: sequence(events),
    };

    const first = applyChoice(session, 'continue');
    expect(first.session.player.round).toBe(8);
    expect(first.session.player.week).toBe(8);
    expect(first.session.player.actionPoints).toBe(75);
    expect(first.session.phase).toBe('event');
    expect(first.session.currentEvent?.id).toBe('seq-step-2');
    expect(first.result.sequenceId).toBe('seq-test-1');
    expect(first.result.sequenceStepIndex).toBe(1);
    expect(first.result.sequenceFinal).toBe(false);

    const second = applyChoice(first.session, 'continue');
    expect(second.session.player.round).toBe(8);
    expect(second.session.currentEvent?.id).toBe('seq-step-3');
    expect(second.result.sequenceStepIndex).toBe(2);
    expect(second.result.sequenceFinal).toBe(false);

    const third = applyChoice(second.session, 'continue');
    expect(third.session.player.round).toBe(9);
    expect(third.session.player.week).toBe(9);
    expect(third.session.phase).toBe('action');
    expect(third.session.currentEvent).toBeNull();
    expect(third.session.activeEventSequence).toBeUndefined();
    expect(third.result.sequenceStepIndex).toBe(3);
    expect(third.result.sequenceFinal).toBe(true);
    expect(third.session.history.map((item) => item.sequenceId)).toEqual([
      'seq-test-1',
      'seq-test-1',
      'seq-test-1',
    ]);
  });

  it('locks non-sequence operations while a sequence is active', () => {
    const events = [event('seq-lock-1', 'Lock 1'), event('seq-lock-2', 'Lock 2')];
    const base = createSession(player(), 1);
    const session = {
      ...base,
      phase: 'event' as const,
      currentEvent: toPublicEvent(events[0]!),
      activeEventSequence: sequence(events),
    };

    expect(() => applyAction(session, 'action-rest')).toThrow('当前事件流程未结束');
  });
});
