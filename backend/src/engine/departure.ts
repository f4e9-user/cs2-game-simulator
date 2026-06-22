import type { ClubTier, GameSession, PendingDeparture, Player } from '../types.js';
import { deriveTeamChemistry } from './synergy.js';
import { derivePlayerTeamIdentities, deriveTeammateIdentities } from './teamIdentity.js';
import { clampNumber } from './utils.js';

export const DEPARTURE_PRESSURE_THRESHOLD = 100;
export const DEPARTURE_INITIAL_PRESSURE = 28;
export const DEPARTURE_INITIAL_LOCK_ROUNDS = 4;

function departureKeyTiers(teamTier: ClubTier): string[] {
  if (teamTier === 'youth') return ['b'];
  if (teamTier === 'semi-pro') return ['a'];
  return ['s-open', 's-closed', 's-class', 'major'];
}

export function createInitialPendingDeparture(
  player: Player,
  rng: () => number,
  destTeamName: string,
  slotId: string,
): PendingDeparture {
  const baseWindowStartRound = player.round + 20 + Math.floor(rng() * 21);
  return {
    slotId,
    departureRound: baseWindowStartRound,
    rumorShown: false,
    revealed: false,
    destTeamName,
    earlyRecruit: false,
    baseWindowStartRound,
    pressure: DEPARTURE_INITIAL_PRESSURE,
    pressureThreshold: DEPARTURE_PRESSURE_THRESHOLD,
    lastPressureRound: player.round,
    reasonTags: [],
  };
}

export function recalcPendingDeparture(
  session: GameSession,
  player: Player,
  departure: PendingDeparture,
): PendingDeparture {
  if (!player.team || !player.roster) return departure;

  const round = player.round ?? 0;
  const roster = player.roster;
  const target = roster.find((tm) => tm.id === departure.slotId);
  if (!target) return departure;

  const currentPressure = departure.pressure ?? DEPARTURE_INITIAL_PRESSURE;
  const pressureThreshold = departure.pressureThreshold ?? DEPARTURE_PRESSURE_THRESHOLD;
  const baseWindowStartRound = departure.baseWindowStartRound
    ?? Math.max(1, departure.departureRound - 20);
  const reasonTags = new Set(departure.reasonTags ?? []);
  let pressure = currentPressure;
  let projectedDelay = 0;

  if (round >= baseWindowStartRound) {
    let drift = 2;
    const trust = player.teamTrust ?? 50;
    const teamChemistry = deriveTeamChemistry(roster, trust);
    const targetChemistry = target.chemistry ?? 50;
    const playerIdentities = derivePlayerTeamIdentities(player, roster);
    const targetIdentities = deriveTeammateIdentities(target, roster);
    const targetTeam = player.team;
    const teamRuntime = session.worldClubs?.runtimeByClubId[targetTeam.clubId];

    drift += Math.round((52 - trust) / 14);
    drift += Math.round((48 - teamChemistry) / 12);
    drift += Math.round((50 - targetChemistry) / 12);

    if (target.personality === 'drama') drift += 2;
    if (target.personality === 'supportive') drift -= 1;
    if (targetIdentities.includes('problem')) drift += 3;
    if (targetIdentities.includes('glue')) drift -= 2;
    if (targetIdentities.includes('caller') && !playerIdentities.includes('caller')) {
      drift += 4;
      reasonTags.add('话语权冲突');
    }
    if (targetIdentities.includes('star') && !playerIdentities.includes('star')) {
      drift += 2;
      reasonTags.add('明星位冲突');
    }
    if (playerIdentities.includes('caller')) drift -= 1;
    if (playerIdentities.includes('star')) drift -= 1;

    if (teamRuntime) {
      const relevantTiers = departureKeyTiers(targetTeam.tier);
      const recentResults = teamRuntime.recentResults.filter((result) => relevantTiers.includes(result.tier)).slice(0, 4);
      for (const result of recentResults) {
        if (result.result === 'win') {
          drift -= 8;
          reasonTags.add('关键赛事夺冠');
        } else if (result.result === 'deep-run') {
          drift -= 5;
          reasonTags.add('关键赛事深轮');
        } else if (result.result === 'loss') {
          drift += 5;
        } else if (result.result === 'early-exit') {
          drift += 8;
          reasonTags.add('关键赛事早出局');
        }
      }
      if (teamRuntime.currentForm >= 20) {
        drift -= 3;
        reasonTags.add('近期状态火热');
      }
      if (teamRuntime.currentForm <= -20) {
        drift += 4;
        reasonTags.add('近期状态低迷');
      }
      if (teamRuntime.clubTrust >= 65) drift -= 2;
      if (teamRuntime.clubTrust <= 35) drift += 2;
      if (teamRuntime.internalChemistry >= 65) drift -= 2;
      if (teamRuntime.internalChemistry <= 35) drift += 2;
      if (teamRuntime.rosterStability <= 40) drift += 2;
    }

    pressure = clampNumber(pressure + drift, 0, pressureThreshold);

    if (teamRuntime?.recentResults[0]) {
      const latest = teamRuntime.recentResults[0];
      const relevantTiers = departureKeyTiers(targetTeam.tier);
      if (relevantTiers.includes(latest.tier) && (latest.result === 'win' || latest.result === 'deep-run')) {
        const lock = latest.result === 'win' ? 6 : 4;
        reasonTags.add('赛事表现暂时稳住阵容');
        return {
          ...departure,
          baseWindowStartRound,
          pressure,
          pressureThreshold,
          lastPressureRound: round,
          lockedUntilRound: Math.max(departure.lockedUntilRound ?? 0, round + lock),
          reasonTags: [...reasonTags],
          departureRound: Math.max(
            round + 1,
            Math.max(baseWindowStartRound, round + lock),
          ),
        };
      }
    }

    const remaining = Math.max(0, pressureThreshold - pressure);
    projectedDelay = Math.max(1, Math.ceil(remaining / Math.max(1, drift > 0 ? drift : 2)));
  }

  const lockedUntilRound = departure.lockedUntilRound ?? 0;
  const projectedRound = round + projectedDelay;
  const departureRound = Math.max(
    baseWindowStartRound,
    projectedRound,
    lockedUntilRound > round ? lockedUntilRound : round + 1,
  );

  return {
    ...departure,
    baseWindowStartRound,
    pressure,
    pressureThreshold,
    lastPressureRound: round,
    reasonTags: [...reasonTags],
    departureRound,
  };
}

export function shouldTriggerPendingDeparture(player: Player, departure: PendingDeparture): boolean {
  const baseWindowStartRound = departure.baseWindowStartRound ?? Math.max(1, departure.departureRound - 20);
  const pressureThreshold = departure.pressureThreshold ?? DEPARTURE_PRESSURE_THRESHOLD;
  return (
    (departure.pressure ?? DEPARTURE_INITIAL_PRESSURE) >= pressureThreshold &&
    player.round >= baseWindowStartRound &&
    player.round >= (departure.lockedUntilRound ?? 0)
  );
}
