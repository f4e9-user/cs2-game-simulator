import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import { createSession, initPlayer } from '../gameEngine.js';
import {
  completeTournamentInstance,
  createTournamentInstance,
  drawTournamentInstance,
  instanceOpponentFor,
  lockTournamentInstance,
  recordPlayerMatchInInstance,
  summarizeTournamentInstance,
} from '../tournamentInstance.js';

function session() {
  const player = initPlayer({
    name: 'InstanceTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return createSession({
    ...player,
    stage: 'pro',
    round: 20,
    year: 1,
    week: 20,
    team: {
      clubId: 'club-cyber-academy',
      name: '赛博学院',
      tag: 'CYA',
      region: '亚太',
      tier: 'youth',
      monthlySalary: 10,
      joinedRound: 1,
    },
  }, 1);
}

describe('tournament instance', () => {
  it('creates a deterministic field with the player club and a path opponent per stage', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing tournament');

    const first = drawTournamentInstance(lockTournamentInstance(createTournamentInstance(session(), tournament)));
    const second = drawTournamentInstance(lockTournamentInstance(createTournamentInstance(session(), tournament)));

    expect(first.id).toBe('y1-a-01:1');
    expect(first.status).toBe('drawn');
    expect(first.playerTeamClubId).toBe('club-cyber-academy');
    expect(first.teams.some((team) => team.clubId === 'club-cyber-academy' && team.source === 'player')).toBe(true);
    expect(first.teams).toHaveLength(16);
    expect(first.playerPath).toHaveLength(tournament.bracket.length);
    expect(first.playerPath?.[0]?.stageIndex).toBe(0);
    expect(instanceOpponentFor(first, 0)).toBe(first.playerPath?.[0]?.opponentClubId);
    expect(first.stages[0]?.matches.length).toBeGreaterThan(1);
    expect(first.teams.map((team) => team.clubId)).toEqual(second.teams.map((team) => team.clubId));
  });

  it('advances tournament instances through registered, locked, and drawn states', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing tournament');

    const registered = createTournamentInstance(session(), tournament);
    const locked = lockTournamentInstance(registered);
    const drawn = drawTournamentInstance(locked);

    expect(registered.status).toBe('registered');
    expect(locked.status).toBe('locked');
    expect(drawn.status).toBe('drawn');
    expect(drawn.teams).toHaveLength(registered.teams.length);
    expect(drawn.playerPath).toHaveLength(tournament.bracket.length);
    expect(drawn.stages[0]?.matches.some((match) => match.playerMatch)).toBe(true);
  });

  it('uses real roster player ids for non-player standout performances', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing tournament');
    let instance = createTournamentInstance(session(), tournament);

    instance = recordPlayerMatchInInstance(instance, 0, true, {
      kills: 22,
      deaths: 14,
      assists: 5,
      headshotRate: 0.42,
      rating: 1.34,
      teamScore: 16,
      enemyScore: 11,
    });

    const nonPlayerMatches = instance.stages[0]?.matches.filter((match) => !match.playerMatch) ?? [];
    expect(nonPlayerMatches.length).toBeGreaterThan(0);
    for (const match of nonPlayerMatches) {
      const rosters = [
        ...(instance.teamRosters?.[match.teamAClubId] ?? []),
        ...(instance.teamRosters?.[match.teamBClubId] ?? []),
      ];
      const rosterIds = new Set(rosters.map((player) => player.id));
      expect(rosterIds.size).toBeGreaterThan(0);
      expect(match.standoutPlayerIds?.every((playerId) => rosterIds.has(playerId))).toBe(true);
    }
  });

  it('records player matches and completes awards/history summaries', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing tournament');
    let instance = createTournamentInstance(session(), tournament);
    const firstOpponent = instance.playerPath?.[0]?.opponentClubId;
    if (!firstOpponent) throw new Error('missing opponent');

    instance = recordPlayerMatchInInstance(instance, 0, true, {
      kills: 22,
      deaths: 14,
      assists: 5,
      headshotRate: 0.42,
      rating: 1.34,
      teamScore: 16,
      enemyScore: 11,
    }, 'InstanceTester');
    const match = instance.stages[0]?.matches.find((m) => m.playerMatch);

    expect(match?.completed).toBe(true);
    expect(match?.winnerClubId).toBe('club-cyber-academy');
    expect(match?.score).toBe('1-0');
    const nonPlayerMatches = instance.stages[0]?.matches.filter((m) => !m.playerMatch) ?? [];
    expect(nonPlayerMatches.length).toBeGreaterThan(0);
    expect(nonPlayerMatches.every((m) => m.completed && m.winnerClubId && m.score && (m.standoutPlayerIds?.length ?? 0) > 0)).toBe(true);

    const completed = completeTournamentInstance(instance, true);
    const summary = summarizeTournamentInstance(completed);

    expect(completed.status).toBe('completed');
    expect(completed.awards?.championClubId).toBe('club-cyber-academy');
    expect(completed.awards?.runnerUpClubId).toBe(firstOpponent);
    expect(summary.playerFinalPlacement).toBe(1);
    expect(summary.awards?.winnerMvp).toMatchObject({
      clubId: 'club-cyber-academy',
      playerId: 'player',
      playerName: 'InstanceTester',
      rating: 1.34,
    });
    expect(summary.awards?.winnerMvp.playerName).toBeTruthy();
  });

  it('updates the next player opponent from same-round winners instead of the static precomputed path', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing tournament');
    let instance = createTournamentInstance(session(), tournament);
    const initialSecondOpponent = instance.playerPath?.[1]?.opponentClubId;

    instance = recordPlayerMatchInInstance(instance, 0, true, {
      kills: 22,
      deaths: 14,
      assists: 5,
      headshotRate: 0.42,
      rating: 1.34,
      teamScore: 16,
      enemyScore: 11,
    });

    const nonPlayerWinner = instance.stages[0]?.matches.find((match) => !match.playerMatch)?.winnerClubId;
    if (!nonPlayerWinner) throw new Error('missing non-player winner');

    expect(instanceOpponentFor(instance, 1)).toBe(nonPlayerWinner);
    expect(initialSecondOpponent).toBeTruthy();
    expect(instance.stages[1]?.matches.find((match) => match.playerMatch)).toMatchObject({
      teamAClubId: 'club-cyber-academy',
      teamBClubId: nonPlayerWinner,
      completed: false,
    });
  });

  it('fast-forwards unresolved non-player bracket after player elimination', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing tournament');
    let instance = createTournamentInstance(session(), tournament);
    const firstOpponent = instance.playerPath?.[0]?.opponentClubId;
    if (!firstOpponent) throw new Error('missing opponent');

    instance = recordPlayerMatchInInstance(instance, 0, false, {
      kills: 9,
      deaths: 18,
      assists: 2,
      headshotRate: 0.31,
      rating: 0.72,
      teamScore: 7,
      enemyScore: 13,
    });
    const completed = completeTournamentInstance(instance, false);
    const finalStage = completed.stages[completed.stages.length - 1];
    const finalMatch = finalStage?.matches[0];

    expect(completed.status).toBe('completed');
    expect(completed.stages.every((stage) => stage.matches.length > 0 && stage.matches.every((match) => match.completed && match.winnerClubId && match.score))).toBe(true);
    expect(finalMatch?.completed).toBe(true);
    expect(completed.awards?.championClubId).toBe(finalMatch?.winnerClubId);
    expect(completed.awards?.runnerUpClubId).toBe(
      finalMatch?.winnerClubId === finalMatch?.teamAClubId ? finalMatch?.teamBClubId : finalMatch?.teamAClubId,
    );
    expect(completed.awards?.championClubId).not.toBe('club-cyber-academy');
    expect(completed.awards?.winnerMvp.playerId.startsWith(`${completed.awards.championClubId}:`)).toBe(true);
    expect(
      completed.stages
        .flatMap((stage) => stage.matches)
        .flatMap((match) => match.standoutPlayerIds ?? [])
    ).toContain(completed.awards?.winnerMvp.playerId);
    expect(
      completed.stages
        .flatMap((stage) => stage.matches)
        .flatMap((match) => match.standoutPlayerIds ?? [])
    ).toContain(completed.awards?.loserMvp.playerId);
  });

  it('assigns final placements from the elimination round instead of grouping every non-finalist at third', () => {
    const tournament = getTournament('y1-a-01');
    if (!tournament) throw new Error('missing tournament');
    let instance = createTournamentInstance(session(), tournament);

    instance = recordPlayerMatchInInstance(instance, 0, false, {
      kills: 9,
      deaths: 18,
      assists: 2,
      headshotRate: 0.31,
      rating: 0.72,
      teamScore: 7,
      enemyScore: 13,
    });

    const completed = completeTournamentInstance(instance, false);
    const placements = completed.teams.map((team) => team.finalPlacement ?? 0);

    expect(placements.filter((placement) => placement === 1)).toHaveLength(1);
    expect(placements.filter((placement) => placement === 2)).toHaveLength(1);
    expect(placements.filter((placement) => placement === 3)).toHaveLength(2);
    expect(placements.some((placement) => placement > 4)).toBe(true);
    expect(new Set(placements).size).toBeGreaterThan(3);
  });
});
