import { describe, expect, it } from 'vitest';
import { getEventById } from '../../data/events/index.js';
import { applyChoice, createSession, endActionPhase, initPlayer } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import type { Player } from '../../types.js';

function player(): Player {
  return {
    ...initPlayer({
      name: 'ChainTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    }),
    stats: {
      agility: 12,
      intelligence: 12,
      mentality: 12,
      experience: 12,
      constitution: 12,
      money: 20,
    },
    round: 12,
    year: 1,
    week: 12,
    actionPoints: 100,
    stage: 'rookie',
    tags: ['interview-pending'],
    pendingApplication: {
      clubId: 'club-cyber-academy',
      clubName: '赛博学院',
      appliedRound: 8,
      responseRound: 10,
    },
  };
}

describe('long event chain sequences', () => {
  it('wraps club interview into same-round sequence before final interview settlement', () => {
    const session = createSession(player(), 1);
    session.phase = 'action';
    session.player.forceNextEvent = 'chain-club-interview-talent';

    const eventPhase = endActionPhase(session).session;

    expect(eventPhase.activeEventSequence?.type).toBe('club-interview');
    expect(eventPhase.currentEvent?.id).toContain('club-interview-12-question-1');
    expect(eventPhase.activeEventSequence?.steps.at(-1)?.generatedEvent?.id)
      .toBe('chain-club-interview-talent');
  });

  it('enters club interview prompt immediately after a successful application response', () => {
    const session = createSession({
      ...player(),
      round: 9,
      tags: ['application-response-ready', 'application-path-talent'],
      pendingApplication: {
        clubId: 'club-cyber-academy',
        clubName: '赛博学院',
        appliedRound: 6,
        responseRound: 9,
      },
    }, 1);
    session.phase = 'event';
    session.currentEvent = toPublicEvent(getEventById('chain-club-response')!);

    const response = applyChoice(session, 'accept-interview', 99).session;

    expect(response.phase).toBe('event');
    expect(response.activeEventSequence?.type).toBe('club-interview');
    expect(response.currentEvent?.id).toBe('club-interview-10-invite');
    expect(response.currentEvent?.title).toBe('线下面试邀请');

    const prompt = applyChoice(response, 'continue').session;

    expect(prompt.phase).toBe('event');
    expect(prompt.currentEvent?.id).toBe('club-interview-10-question-1');
    expect(prompt.activeEventSequence?.currentIndex).toBe(1);
  });
});
