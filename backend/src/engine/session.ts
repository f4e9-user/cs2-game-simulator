import { buildLeaderboard } from '../data/leaderboard.js';
import type { GameSession, Player } from '../types.js';
import { activateClubRuntime, ensureWorldClubPool } from './worldClubs.js';
import { hashString, nowIso } from './utils.js';

function seededSessionToken(seed: number, kind: 'session' | 'token'): string {
  const a = Math.abs(hashString(`${kind}:${seed}:a`)).toString(36).padStart(7, '0');
  const b = Math.abs(hashString(`${kind}:${seed}:b`)).toString(36).padStart(7, '0');
  return `${kind}-${seed}-${a}-${b}`;
}

export function createSession(player: Player, rngSeed: number): GameSession {
  const id = seededSessionToken(rngSeed, 'session');
  const apiToken = seededSessionToken(rngSeed, 'token');
  const ts = nowIso();
  const seedSession: GameSession = {
    id,
    player,
    apiToken,
    phase: 'action',
    currentEvent: null,
    history: [],
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
    leaderboard: [],
  };
  const withWorld = ensureWorldClubPool(seedSession);
  const seededWorld = player.team
    ? activateClubRuntime(withWorld, player.team.clubId, 'session-start')
    : withWorld;
  const leaderboard = buildLeaderboard(seededWorld);

  return {
    ...seededWorld,
    phase: 'action',
    currentEvent: null,
    leaderboard,
  };
}
