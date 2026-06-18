import { describe, expect, it } from 'vitest';
import { getClub } from '../clubs.js';
import { buildLeaderboard } from '../leaderboard.js';
import { activateClubRuntime, computeClubVrsScore } from '../../engine/worldClubs.js';
import { createSession, initPlayer } from '../../engine/gameEngine.js';

function makeSession() {
  const player = initPlayer({
    name: 'BoardTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return createSession({
    ...player,
    stage: 'youth',
    round: 12,
    year: 1,
    week: 12,
  }, 1);
}

describe('leaderboard generation', () => {
  it('uses a free-agent row instead of the player name when the player has no club', () => {
    const session = makeSession();
    const board = buildLeaderboard(session);
    const playerRow = board.find((row) => row.isPlayer);

    expect(playerRow?.name).toBe('自由人');
    expect(playerRow?.clubId).toBe('free-agent');
  });

  it('preserves free-agent points across leaderboard rebuilds before joining a club', () => {
    const session = makeSession();
    const board = buildLeaderboard({
      ...session,
    }, [
      {
        clubId: 'free-agent',
        name: '自由人',
        tag: 'FREE',
        region: '—',
        points: 17,
        isPlayer: true,
        kind: 'free-agent',
      },
    ]);
    const playerRow = board.find((row) => row.isPlayer);

    expect(playerRow?.points).toBe(17);
  });

  it('keeps a joined club on its own runtime score instead of inheriting free-agent points', () => {
    const session = makeSession();
    const club = getClub('club-cyber-academy');
    if (!club) throw new Error('missing club fixture');

    const joined = activateClubRuntime(
      {
        ...session,
        player: {
          ...session.player,
          team: {
            clubId: club.id,
            name: club.name,
            tag: club.tag,
            region: club.region,
            tier: club.tier,
            monthlySalary: 12,
            joinedRound: session.player.round,
          },
        },
      },
      club.id,
      'test',
    );
    const runtime = joined.worldClubs!.runtimeByClubId[club.id]!;
    joined.worldClubs!.runtimeByClubId[club.id] = {
      ...runtime,
      seasonPoints: 28,
      vrsScore: 42,
    };

    const board = buildLeaderboard(joined);
    const playerRow = board.find((row) => row.isPlayer);

    expect(playerRow?.clubId).toBe(club.id);
    expect(playerRow?.name).toBe(club.name);
    expect(playerRow?.points).toBe(computeClubVrsScore(joined.worldClubs!.runtimeByClubId[club.id]!));
    expect(board.some((row) => row.clubId === 'free-agent')).toBe(false);
  });

  it('uses materialized rival display identity instead of placeholder club data', () => {
    const session = activateClubRuntime(makeSession(), 'club-rival-semi', 'test');
    const rival = session.player.rivals[0]!;

    const board = buildLeaderboard(session);
    const rivalRow = board.find((row) => row.clubId === 'club-rival-semi');

    expect(rivalRow?.name).toBe(rival.name);
    expect(rivalRow?.tag).toBe(rival.tag);
    expect(rivalRow?.region).toBe(rival.region);
    expect(rivalRow?.name).not.toBe('（对手映射）');
    expect(rivalRow?.tag).not.toBe('???');
  });
});
