import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import type { GameSession } from '../../types.js';
import { applyChoice, createSession, endActionPhase, initPlayer } from '../gameEngine.js';
import { createTournamentInstance } from '../tournamentInstance.js';

function entrant(tournamentId: string, stageIndex = 0): GameSession {
  const tournament = getTournament(tournamentId)!;
  const player = initPlayer({ name: 'ParticipationTester', traitIds: ['aim-god', 'tactical-mind', 'ice-cold'], backgroundId: '' });
  player.stage = 'pro';
  player.round = 20;
  player.week = 20;
  player.forceMatchResult = 'win';
  player.stats.money = 300;
  player.pendingMatch = {
    tournamentId, name: tournament.name, tier: tournament.tier,
    progressionTier: tournament.progressionTier,
    stageIndex, resolveYear: 1, resolveWeek: 20,
  };
  return createSession(player, 551);
}

function finishStage(session: GameSession): { session: GameSession; intermediateCounts: number[] } {
  const pending = session.player.pendingMatch!;
  session = {
    ...session, phase: 'action', currentEvent: null, queuedEvents: [], activeEventSequence: undefined,
    player: { ...session.player, year: pending.resolveYear, week: pending.resolveWeek, restRounds: 0 },
  };
  session = endActionPhase(session).session;
  const intermediateCounts: number[] = [];
  for (let step = 0; step < 15; step++) {
    const choices = session.currentEvent?.choices ?? [];
    const choice = choices.find((item) => item.id === 'series-confirm')
      ?? choices.find((item) => item.id === 'match-play')
      ?? choices.find((item) => item.id === 'break-recover')
      ?? choices[0];
    if (!choice) throw new Error('missing tournament choice');
    const resolved = applyChoice(session, choice.id);
    session = resolved.session;
    if (resolved.result.eventId === `tournament-${pending.tournamentId}--${pending.stageIndex}`) {
      return { session, intermediateCounts };
    }
    intermediateCounts.push(session.player.tournamentParticipations);
  }
  throw new Error('tournament stage did not finish');
}

describe('tournament participation accounting', () => {
  it('counts identical tier and progression tier once', () => {
    const result = finishStage(entrant('y1-c-01'));
    expect(result.session.player.tournamentParticipations).toBe(1);
    expect(result.session.player.tierParticipations).toEqual({ c: 1 });
  });

  it('preserves distinct tier aliases without counting a second participation', () => {
    const result = finishStage(entrant('y1-s-open-01'));
    expect(result.session.player.tournamentParticipations).toBe(1);
    expect(result.session.player.tierParticipations).toEqual({ 's-open': 1, 's-qualifier': 1 });
  });

  it('counts a multi-stage event only once and does not count BO3 maps or breaks', () => {
    const first = finishStage(entrant('y1-b-01'));
    expect(first.session.player.tournamentParticipations).toBe(1);
    const final = finishStage(JSON.parse(JSON.stringify(first.session)) as GameSession);
    expect(final.intermediateCounts.length).toBeGreaterThan(1);
    expect(final.intermediateCounts.every((count) => count === 1)).toBe(true);
    expect(final.session.player.tournamentParticipations).toBe(1);
    expect(final.session.player.tierParticipations.b).toBe(1);
  });

  it('counts a direct entry at its first completed series, never each BO5 map', () => {
    const final = finishStage(entrant('y1-major-02', 5));
    expect(final.intermediateCounts.length).toBeGreaterThan(3);
    expect(final.intermediateCounts.every((count) => count === 0)).toBe(true);
    expect(final.session.player.tournamentParticipations).toBe(1);
    expect(final.session.player.tierParticipations.major).toBe(1);
  });

  it('does not recount a direct-entry group-stage retry', () => {
    const session = entrant('y1-s-main-01', 1);
    session.player.forceMatchResult = 'loss';
    const first = finishStage(session);
    expect(first.session.player.pendingMatch?.stageLosses).toBe(1);
    expect(first.session.player.tournamentParticipations).toBe(1);
    const second = finishStage(first.session);
    expect(second.session.player.pendingMatch).toBeNull();
    expect(second.session.player.tournamentParticipations).toBe(1);
    expect(second.session.player.tierParticipations).toEqual({ 's-class': 1, 's-main': 1 });
  });

  it('recognizes a completed stage in a legacy save without the participation marker', () => {
    const first = finishStage(entrant('y1-b-01'));
    delete first.session.player.pendingMatch!.participationRecorded;
    const final = finishStage(first.session);
    expect(final.session.player.tournamentParticipations).toBe(1);
    expect(final.session.player.tierParticipations.b).toBe(1);
  });

  it('keeps solo opponents, actual BO3 scores, awards and history aligned through settlement', () => {
    const session = entrant('y1-b-01');
    session.activeTournamentInstance = createTournamentInstance(session, getTournament('y1-b-01')!, { playerEntry: true });
    session.player.pendingMatch!.tournamentInstanceId = session.activeTournamentInstance.id;
    const entryId = session.activeTournamentInstance.playerTeamClubId!;
    const first = finishStage(session);
    const nextOpponent = first.session.player.pendingMatch?.opponent?.clubId;
    expect(first.session.activeTournamentInstance?.stages[1]?.matches.find((match) => match.playerMatch)?.teamBClubId).toBe(nextOpponent);
    first.session.player.forceMatchResult = 'win';
    const final = finishStage(first.session);
    const summary = final.session.tournamentHistory?.[0];
    expect(summary).toMatchObject({ playerTeamClubId: entryId, championClubId: entryId, playerFinalPlacement: 1 });
    expect(summary?.playerMatches).toHaveLength(2);
    expect(summary?.playerMatches?.[1]).toMatchObject({ teamBClubId: nextOpponent, score: '2-0', winnerClubId: entryId });
    expect(final.session.worldClubs?.runtimeByClubId[entryId]).toBeUndefined();
    expect(final.session.player.team).toBeNull();
  });
});
