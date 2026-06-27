import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '../../data/leaderboard.js';
import { getTournament } from '../../data/tournaments.js';
import { createSession, endActionPhase, initPlayer } from '../gameEngine.js';
import { tickWorldClubRuntimes } from '../worldClubs.js';
import type { GameSession } from '../../types.js';

function sessionAt(year: number, week: number, round: number): GameSession {
  return createSession({
    ...initPlayer({
      name: 'WorldNewsTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    }),
    stage: 'pro',
    year,
    week,
    round,
    actionPoints: 100,
    tags: [],
  }, 77);
}

describe('world news V2 consistency', () => {
  it('does not produce a Major result at Y1 W1', () => {
    const eventPhase = endActionPhase(sessionAt(1, 1, 1));
    const news = eventPhase.session.weeklyNews ?? [];

    expect(news.some((item) => item.title.includes('Major') || item.narrative.includes('Major'))).toBe(false);
    expect(news.some((item) => item.eventId.includes('major'))).toBe(false);
  });

  it('simulates a Major only on its result week and stores one traceable champion snapshot', () => {
    const major = getTournament('y1-major-01');
    if (!major) throw new Error('missing Major fixture');

    const signupWeek = major.signupWeeks === 'always' ? 1 : major.signupWeeks[0]!;
    const beforeResult = tickWorldClubRuntimes(sessionAt(1, signupWeek, signupWeek), signupWeek, 'round');
    expect(beforeResult.worldClubs?.tournamentSnapshots?.some((snapshot) => snapshot.tournamentId === major.id)).toBe(false);

    const resultRound = signupWeek + major.bracket.length;
    const resultWeek = resultRound;
    const resultSession = tickWorldClubRuntimes(sessionAt(1, resultWeek, resultRound), resultRound, 'round');
    const snapshots = resultSession.worldClubs?.tournamentSnapshots?.filter((snapshot) => snapshot.tournamentId === major.id) ?? [];

    expect(snapshots).toHaveLength(1);
    const snapshot = snapshots[0]!;
    expect(snapshot.resultYear).toBe(1);
    expect(snapshot.resultWeek).toBe(resultWeek);
    expect(snapshot.championClubId).toBeTruthy();
    expect(snapshot.runnerUpClubId).toBeTruthy();
    expect(snapshot.championClubId).not.toBe(snapshot.runnerUpClubId);
    expect(snapshot.participants.map((participant) => participant.clubId)).toContain(snapshot.championClubId);
  });

  it('uses only VRS-visible world clubs in tournament result news', () => {
    const major = getTournament('y1-major-01');
    if (!major) throw new Error('missing Major fixture');
    const resultRound = (major.signupWeeks as number[])[0]! + major.bracket.length;
    const ticked = tickWorldClubRuntimes(sessionAt(1, resultRound, resultRound), resultRound, 'round');
    const eventPhase = endActionPhase({
      ...ticked,
      phase: 'action',
      weeklyNews: [],
    });
    const snapshot = eventPhase.session.worldClubs?.tournamentSnapshots?.find((item) => item.tournamentId === major.id);
    if (!snapshot) throw new Error('missing tournament snapshot');
    const news = eventPhase.session.weeklyNews?.find((item) => item.source?.tournamentId === major.id);

    expect(news?.source?.clubId).toBe(snapshot.championClubId);
    expect(buildLeaderboard(eventPhase.session).some((row) => row.clubId === snapshot.championClubId)).toBe(true);
    expect(eventPhase.session.leaderboard.some((row) => row.clubId === snapshot.championClubId)).toBe(true);
  });

  it('emits opening, group, knockout and result news at the correct Major weeks', () => {
    const major = getTournament('y1-major-01');
    if (!major) throw new Error('missing Major fixture');
    const signupWeek = major.signupWeeks === 'always' ? 1 : major.signupWeeks[0]!;

    const opening = endActionPhase(sessionAt(1, signupWeek, signupWeek)).session.weeklyNews ?? [];
    expect(opening.some((item) => item.source?.tournamentId === major.id && item.title.includes('开赛'))).toBe(true);
    expect(opening.some((item) => item.source?.tournamentId === major.id && item.title.includes('落幕'))).toBe(false);

    const groupWeek = signupWeek + 2;
    const group = endActionPhase(sessionAt(1, groupWeek, groupWeek)).session.weeklyNews ?? [];
    expect(group.some((item) => item.source?.tournamentId === major.id && item.title.includes('小组赛'))).toBe(true);

    const knockoutWeek = signupWeek + 3;
    const knockout = endActionPhase(sessionAt(1, knockoutWeek, knockoutWeek)).session.weeklyNews ?? [];
    expect(knockout.some((item) => item.source?.tournamentId === major.id && item.title.includes('淘汰赛'))).toBe(true);

    const resultRound = signupWeek + major.bracket.length;
    const result = endActionPhase(sessionAt(1, resultRound, resultRound)).session.weeklyNews ?? [];
    expect(result.some((item) => item.source?.tournamentId === major.id && item.title.includes('落幕'))).toBe(true);
  });
});
