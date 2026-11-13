import { describe, expect, it } from 'vitest';
import { getTournament } from '../../data/tournaments.js';
import { createSession, initPlayer } from '../gameEngine.js';
import { SessionRepo } from '../../storage/d1.js';
import { assignPendingMatchOpponent } from '../worldClubs.js';
import {
  completeTournamentInstance,
  createTournamentInstance,
  drawTournamentInstance,
  ensurePlayerTournamentEntry,
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
  it('gives a registered free agent a stable entry, player match and matching opponent', () => {
    const solo = session();
    solo.player.team = null;
    const tournament = getTournament('y1-c-01')!;
    const first = createTournamentInstance(solo, tournament, { playerEntry: true });
    const second = createTournamentInstance(solo, tournament, { playerEntry: true });
    const entry = first.teams.find((team) => team.source === 'player');

    expect(entry).toMatchObject({ clubId: first.playerTeamClubId, displayName: 'InstanceTester（自由人）' });
    expect(first.playerTeamClubId).toBeTruthy();
    expect(first.playerTeamClubId).toBe(second.playerTeamClubId);
    expect(first.teams).toHaveLength(8);
    expect(first.stages[0]?.matches.filter((match) => match.playerMatch)).toHaveLength(1);
    expect(first.stages[0]?.matches.find((match) => match.playerMatch)).toMatchObject({
      teamAClubId: first.playerTeamClubId,
      teamBClubId: instanceOpponentFor(first, 0),
    });
    expect(solo.player.team).toBeNull();
  });

  it('does not insert a free agent into an unregistered world-only tournament', () => {
    const solo = session();
    solo.player.team = null;
    const instance = createTournamentInstance(solo, getTournament('y1-c-01')!);
    expect(instance.playerTeamClubId).toBeUndefined();
    expect(instance.teams.every((team) => team.source !== 'player')).toBe(true);
  });

  it.each([true, false])('repairs an old active solo save on load, idempotently (instance link=%s)', async (hasLink) => {
    const legacy = session();
    legacy.player.team = null;
    const tournament = getTournament('y1-c-01')!;
    legacy.activeTournamentInstance = createTournamentInstance(legacy, tournament);
    const oldOpponent = instanceOpponentFor(legacy.activeTournamentInstance, 0);
    legacy.player.pendingMatch = {
      tournamentId: tournament.id, tier: tournament.tier, name: tournament.name,
      stageIndex: 0, resolveYear: 1, resolveWeek: 20,
      ...(hasLink ? { tournamentInstanceId: legacy.activeTournamentInstance.id } : {}),
    };
    const before = structuredClone(legacy);
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({ data: JSON.stringify(legacy) }) }) }) } as unknown as D1Database;
    const restored = (await new SessionRepo(db).load(legacy.id))!;

    expect(restored.activeTournamentInstance?.playerTeamClubId).toBeTruthy();
    expect(restored.activeTournamentInstance?.teams).toHaveLength(8);
    expect(restored.activeTournamentInstance?.stages[0]?.matches.find((match) => match.playerMatch)?.teamBClubId).toBe(oldOpponent);
    expect(restored.player.pendingMatch?.tournamentInstanceId).toBe(restored.activeTournamentInstance?.id);
    expect(ensurePlayerTournamentEntry(restored)).toBe(restored);
    expect(restored.history).toEqual(before.history);
    expect(restored.tournamentHistory).toEqual(before.tournamentHistory);
    expect(legacy).toEqual(before);
  });

  it('does not repair an unregistered or completed instance', () => {
    const unregistered = session();
    unregistered.player.team = null;
    unregistered.activeTournamentInstance = createTournamentInstance(unregistered, getTournament('y1-c-01')!);
    expect(ensurePlayerTournamentEntry(unregistered)).toBe(unregistered);
    unregistered.activeTournamentInstance.status = 'completed';
    unregistered.player.pendingMatch = { tournamentId: 'y1-c-01', tier: 'c', name: 'C', stageIndex: 0, resolveYear: 1, resolveWeek: 20 };
    expect(ensurePlayerTournamentEntry(unregistered)).toBe(unregistered);
  });

  it('includes a legacy opponent selected outside the old field when the instance link is absent', () => {
    const player = initPlayer({ name: 'LegacySolo', traitIds: ['aim-god', 'tactical-mind', 'ice-cold'], backgroundId: '' });
    const legacy = createSession(player, 1);
    const tournament = getTournament('y1-c-01')!;
    legacy.activeTournamentInstance = createTournamentInstance(legacy, tournament);
    const pending = { tournamentId: tournament.id, tier: tournament.tier, name: tournament.name, stageIndex: 0, resolveYear: 1, resolveWeek: 3 };
    const assigned = assignPendingMatchOpponent(legacy, pending);
    assigned.session.player.pendingMatch = assigned.pendingMatch;
    const opponent = assigned.pendingMatch.opponent!.clubId;
    expect(legacy.activeTournamentInstance.teams.some((team) => team.clubId === opponent)).toBe(false);

    const repaired = ensurePlayerTournamentEntry(assigned.session);
    const instance = repaired.activeTournamentInstance!;
    expect(instance.teams).toHaveLength(8);
    expect(new Set(instance.teams.map((team) => team.clubId)).size).toBe(8);
    expect(instance.teams.some((team) => team.clubId === opponent)).toBe(true);
    expect(instance.teamRosters?.[opponent]?.length).toBeGreaterThan(0);
    expect(instance.stages[0]?.matches.find((match) => match.playerMatch)?.teamBClubId).toBe(opponent);
    expect(ensurePlayerTournamentEntry(repaired)).toBe(repaired);
  });

  it.each([
    ['y1-major-01', 0, 17], ['y1-major-02', 0, 17],
    ['y1-major-01', 4, 3], ['y1-major-02', 4, 3],
  ] as const)('never revives a free agent eliminated from %s stage %i', (tournamentId, eliminatedStage, placement) => {
    const solo = session();
    solo.id = createSession(solo.player, 551).id;
    solo.player.team = null;
    let instance = createTournamentInstance(solo, getTournament(tournamentId)!, { playerEntry: true });
    const playerId = instance.playerTeamClubId!;
    instance = recordPlayerMatchInInstance(instance, eliminatedStage, false);
    const completed = completeTournamentInstance(instance, false);
    expect(summarizeTournamentInstance(completed).playerFinalPlacement).toBe(placement);
    expect(completed.awards?.championClubId).not.toBe(playerId);
    expect(completed.awards?.runnerUpClubId).not.toBe(playerId);
    expect(completed.stages.slice(eliminatedStage + 1).flatMap((stage) => stage.matches)
      .some((match) => match.teamAClubId === playerId || match.teamBClubId === playerId)).toBe(false);
  });

  it.each([true, false])('persists a free-agent result and placement after a final (won=%s)', (won) => {
    const solo = session();
    solo.player.team = null;
    let instance = createTournamentInstance(solo, getTournament('y1-c-01')!, { playerEntry: true });
    const opponent = instanceOpponentFor(instance, 0)!;
    instance = recordPlayerMatchInInstance(instance, 0, won, {
      kills: 18, deaths: 12, assists: 4, headshotRate: 0.4, rating: 1.2, teamScore: 13, enemyScore: 8,
    }, solo.player.name);
    const completed = completeTournamentInstance(instance, won);
    const summary = summarizeTournamentInstance(completed);
    expect(summary.playerFinalPlacement).toBe(won ? 1 : 2);
    expect(summary.playerTeamName).toBe('InstanceTester（自由人）');
    expect(summary.championClubId).toBe(won ? instance.playerTeamClubId : opponent);
    expect(summary.runnerUpClubId).toBe(won ? opponent : instance.playerTeamClubId);
    expect(summary.playerMatches?.[0]).toMatchObject({
      completed: true, winnerClubId: summary.championClubId,
      teamAClubId: instance.playerTeamClubId, teamBClubId: opponent,
    });
    expect(new Set(completed.stages[0]?.matches.flatMap((match) => [match.teamAClubId, match.teamBClubId])).size)
      .toBe((completed.stages[0]?.matches.length ?? 0) * 2);
  });

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
