import type { LeaderboardTeam, Player } from '../types.js';
import { generateRivals, type Rival } from './rivals.js';

const FILLER_TEAM_COUNT = 10;

// Build the initial leaderboard for a new session: player's team + rivals
// (already generated) + several filler teams. All start at 0 points.
export function buildLeaderboard(player: Player): LeaderboardTeam[] {
  const all: LeaderboardTeam[] = [];

  const playerTeam: LeaderboardTeam = {
    name: player.team?.name ?? `Team ${player.name || 'You'}`,
    tag: player.team?.tag ?? 'YOU',
    region: player.team?.region ?? 'YOU',
    points: 0,
    isPlayer: true,
  };
  all.push(playerTeam);

  const seen = new Set<string>([playerTeam.name]);
  // Player.rivals are the named opponents used in event narratives.
  for (const r of player.rivals) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    all.push({
      name: r.name,
      tag: r.tag,
      region: r.region,
      points: rndPoints(0, 8),
      isPlayer: false,
    });
  }

  // Filler teams to make the board interesting.
  const fillers = generateRivals(FILLER_TEAM_COUNT);
  for (const f of fillers) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    all.push({
      name: f.name,
      tag: f.tag,
      region: f.region,
      points: rndPoints(0, 12),
      isPlayer: false,
    });
  }

  return sortBoard(all);
}

// Each round, non-player teams gain points at a pace matching real tournament
// schedules: small chance of a tournament win, modest chance of a stage finish.
// The player team is updated explicitly when they complete tournament stages
// (stageRewardDelta), not here.
export function tickLeaderboard(
  board: LeaderboardTeam[],
  rng: () => number = Math.random,
): LeaderboardTeam[] {
  const updated = board.map((t) => {
    if (t.isPlayer) return t;
    const r = rng();
    let delta = 0;
    if (r < 0.05) delta = 3;       // tournament win (~once every 20 rounds)
    else if (r < 0.25) delta = 1;  // stage finish
    return { ...t, points: t.points + delta };
  });
  return sortBoard(updated);
}

export function addPlayerPoints(
  board: LeaderboardTeam[],
  delta: number,
): LeaderboardTeam[] {
  return sortBoard(
    board.map((t) =>
      t.isPlayer ? { ...t, points: Math.max(0, t.points + delta) } : t,
    ),
  );
}

function sortBoard(board: LeaderboardTeam[]): LeaderboardTeam[] {
  return [...board].sort((a, b) => b.points - a.points);
}

function rndPoints(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export type { Rival };
