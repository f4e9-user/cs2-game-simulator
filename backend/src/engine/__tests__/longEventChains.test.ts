import { describe, expect, it } from 'vitest';
import { createSession, endActionPhase, initPlayer } from '../gameEngine.js';
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
});
