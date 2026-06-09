import { describe, expect, it } from 'vitest';
import { applyChoice, createSession, initPlayer } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import { getEventById } from '../../data/events/index.js';
import type { Player, PlayerTeam } from '../../types.js';

function basePlayer(): Player {
  const player = initPlayer({
    name: 'PromotionTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
    stats: {
      agility: 6,
      intelligence: 5,
      mentality: 5,
      experience: 1,
      constitution: 1,
      money: 0,
    },
  });
  const youthTeam: PlayerTeam = {
    clubId: 'club-local-wolves',
    name: '本地狼队',
    tag: 'LW',
    region: '本地',
    tier: 'youth',
    monthlySalary: 10,
    joinedRound: 1,
  };
  return {
    ...player,
    stage: 'youth',
    round: 10,
    team: youthTeam,
    everHadTeam: true,
    salaryTracker: { lastPayRound: 10, joinedRound: 1, payCycle: 4 },
    roster: [],
    teamTrust: 50,
    promotionPending: 'second',
  };
}

describe('promotion events', () => {
  it('moves the player to a real semi-pro club when youth promotion succeeds', () => {
    const event = getEventById('promotion-youth-to-second');
    expect(event).toBeTruthy();

    const session = createSession(basePlayer(), 1);
    session.id = 'promotion-test-stable';
    session.currentEvent = toPublicEvent(event!, session.player.rivals, session.player.roster ?? []);

    const { session: updated, result } = applyChoice(session, 'accept-second-offer', 20);

    expect(result.success).toBe(true);
    expect(updated.player.stage).toBe('second');
    expect(updated.player.team?.tier).toBe('semi-pro');
    expect(updated.player.team?.clubId).not.toBe('club-local-wolves');
    expect(updated.player.team?.name).not.toBe('本地狼队');
    expect(updated.player.roster?.length).toBeGreaterThan(0);
    expect(updated.player.promotionPending).toBeNull();
  });

  it('uses a 4-round cooldown when a promotion offer is declined', () => {
    const event = getEventById('promotion-youth-to-second');
    expect(event).toBeTruthy();

    const session = createSession(basePlayer(), 1);
    session.currentEvent = toPublicEvent(event!, session.player.rivals, session.player.roster ?? []);

    const { session: updated } = applyChoice(session, 'decline-second-offer', 0);

    expect(updated.player.stage).toBe('youth');
    expect(updated.player.promotionPending).toBeNull();
    expect(updated.player.promotionCooldown).toBe(updated.player.round + 4);
  });
});
