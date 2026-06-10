import { getClub } from './clubs.js';
import { previewClubRuntime } from '../engine/worldClubs.js';
import type { GameSession, LeaderboardTeam, Player, WorldClubPool } from '../types.js';
import { generateRivals, type Rival } from './rivals.js';

const FILLER_TEAM_COUNT = 10;
const PLAYER_NAMES = [
  'Kova', 'Blitz', 'Raze', 'Frost', 'Viper', 'Oni', 'Specter', 'Mirage',
  'Wraith', 'Phoenix', 'Nova_Star', 'Zenith_Ace', 'Helix_Core', 'Volt_Surge',
  'Echo_Beam', 'Cinder_Flare', 'Pixel_Drift', 'Frostline_Ice', 'Phantom_Ghost',
  'Vortex_Spin', 'Oblivion_Dusk', 'Blackbird_Night', 'Reverb_Sound',
  'Onyx_Stone', 'Spectre_Shade',
] as const;


interface LeaderboardContext {
  id: string;
  player: Player;
  worldClubs?: WorldClubPool;
}

// Deterministic hash for seeding player assignments from team name.
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Pick 1-2 deterministic player names for a team based on its name hash.
function pickPlayersForTeam(teamName: string): string[] {
  const hash = hashString(teamName);
  const count = 1 + (hash % 2); // 1 or 2 players
  const players: string[] = [];
  const used = new Set<string>();

  let seed = hash;
  for (let i = 0; i < count; i++) {
    seed = ((seed * 1103515245 + 12345) >>> 0); // LCG
    const index = seed % PLAYER_NAMES.length;
    const name = PLAYER_NAMES[index]!;
    if (!used.has(name)) {
      used.add(name);
      players.push(name);
    }
  }

  if (players.length === 0) {
    players.push(PLAYER_NAMES[hash % PLAYER_NAMES.length]!);
  }

  return players;
}

export function buildLeaderboard(
  session: LeaderboardContext,
  previousLeaderboard?: LeaderboardTeam[],
): LeaderboardTeam[] {
  const all: LeaderboardTeam[] = [];
  const playerTeamId = session.player.team?.clubId;
  const previousFreeAgentPoints = previousLeaderboard?.find((row) => row.clubId === 'free-agent')?.points
    ?? previousLeaderboard?.find((row) => row.isPlayer && row.kind === 'free-agent')?.points
    ?? 0;

  if (session.worldClubs) {
    const clubIds = [
      ...session.worldClubs.activeClubIds,
      ...session.worldClubs.relevantClubIds,
      ...session.worldClubs.staticClubIds,
    ];
    const seen = new Set<string>();
    for (const clubId of clubIds) {
      if (seen.has(clubId)) continue;
      seen.add(clubId);
      const club = getClub(clubId);
      if (!club) continue;
      const runtime = session.worldClubs.runtimeByClubId[clubId] ?? previewClubRuntime({
        id: session.id,
        player: session.player,
        worldClubs: session.worldClubs,
      } as GameSession, clubId);
      all.push({
        clubId,
        name: club.name,
        tag: club.tag,
        region: club.region,
        points: runtime.seasonPoints,
        isPlayer: playerTeamId === clubId,
        kind: 'club',
        players: runtime.fullRoster
          .filter((tm) => tm.status === 'starter')
          .slice(0, 2)
          .map((tm) => tm.name),
      });
    }
    if (playerTeamId && !all.some((row) => row.clubId === playerTeamId) && session.player.team) {
      const runtime = session.worldClubs.runtimeByClubId[playerTeamId];
      all.push({
        clubId: playerTeamId,
        name: session.player.team.name,
        tag: session.player.team.tag,
        region: session.player.team.region,
        points: runtime?.seasonPoints ?? 0,
        isPlayer: true,
        kind: 'club',
      });
    }
    if (!session.player.team) {
      all.push({
        clubId: 'free-agent',
        name: '自由人',
        tag: 'FREE',
        region: '—',
        points: previousFreeAgentPoints,
        isPlayer: true,
        kind: 'free-agent',
      });
    }
  } else {
    const playerTeam: LeaderboardTeam = {
      name: session.player.team?.name ?? '自由人',
      tag: session.player.team?.tag ?? 'FREE',
      region: session.player.team?.region ?? '—',
      points: 0,
      isPlayer: true,
      kind: session.player.team ? 'club' : 'free-agent',
    };
    all.push(playerTeam);

    const seen = new Set<string>([playerTeam.name]);
    for (const r of session.player.rivals) {
      if (seen.has(r.name)) continue;
      seen.add(r.name);
      all.push({
        name: r.name,
        tag: r.tag,
        region: r.region,
        points: rndPoints(0, 8),
        isPlayer: false,
        kind: 'rival',
        players: pickPlayersForTeam(r.name),
      });
    }

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
        kind: 'rival',
        players: pickPlayersForTeam(f.name),
      });
    }
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
