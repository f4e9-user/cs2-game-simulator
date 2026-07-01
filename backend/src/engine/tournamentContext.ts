import {
  TOURNAMENT_CONTEXT_EVENTS,
  type TournamentContextEventDef,
  type TournamentContextEventGroup,
  type TournamentContextPostMatchCondition,
} from '../data/events/tournamentContext.js';
import type { Tournament } from '../data/tournaments.js';
import type {
  EventDef,
  MatchStats,
  PendingMatch,
  Player,
  TournamentContext,
  TournamentContextEventRef,
  TournamentContextMatchResult,
  TournamentContextPhase,
} from '../types.js';
import { pendingAwayTournamentTravelContext } from './travel.js';

export function createTournamentContext(
  player: Player,
  pendingMatch: PendingMatch,
  tournament: Tournament,
): TournamentContext {
  const base: TournamentContext = {
    tournamentId: pendingMatch.tournamentId,
    stageIndex: pendingMatch.stageIndex,
    signedUpAtRound: player.round,
    signedUpAtYear: player.year ?? 1,
    signedUpAtWeek: player.week ?? 1,
    resolveYear: pendingMatch.resolveYear,
    resolveWeek: pendingMatch.resolveWeek,
    phase: 'signup',
    contextEventQueue: [],
    consumedContextEventIds: [],
    pressureLevel: pressureLevelForTournament(tournament, player),
    stakesLevel: stakesLevelForTournament(tournament),
  };

  return {
    ...base,
    contextEventQueue: enqueueTournamentContextCandidates(base, player, ['signup', 'pre-match']),
  };
}

export function pickTournamentContextEvent(player: Player, aiEvents: EventDef[] = []): EventDef | null {
  const context = enqueueAiTournamentContextCandidates(player, aiEvents);
  if (!context) return null;
  if (!player.pendingMatch && context.phase !== 'post-match') return null;
  if (context.phase === 'signup' && player.round !== context.signedUpAtRound) return null;
  if (context.phase === 'match' || context.phase === 'complete') return null;

  const queue = [...context.contextEventQueue]
    .filter((ref) => ref.phase === context.phase)
    .filter((ref) => ref.stageIndex === context.stageIndex)
    .filter((ref) => !ref.expiresAtRound || ref.expiresAtRound >= player.round)
    .sort((a, b) => b.priority - a.priority);

  for (const ref of queue) {
    const eventId = canonicalTournamentContextEventId(ref.eventId);
    if (context.consumedContextEventIds.includes(eventId)) continue;
    const event = ref.generatedEvent ??
      TOURNAMENT_CONTEXT_EVENTS.find((candidate) => candidate.id === eventId);
    if (event && tournamentContextEventMatches(event, player, context.phase)) return event;
  }

  if (context.phase === 'pre-match') {
    const baseline = TOURNAMENT_CONTEXT_EVENTS.find((candidate) => candidate.id === 'tournament-context-baseline-prep');
    if (baseline && tournamentContextEventMatches(baseline, player, context.phase)) return baseline;
  }

  return null;
}

function enqueueAiTournamentContextCandidates(
  player: Player,
  aiEvents: EventDef[],
): TournamentContext | undefined {
  const context = normalizeTournamentContextPhase(player);
  if (!context || !player.pendingMatch || context.phase === 'match' || context.phase === 'complete') return context;
  if (context.phase === 'signup' && player.round !== context.signedUpAtRound) return context;

  const existing = new Set(context.contextEventQueue.map((ref) => `${ref.phase}:${ref.stageIndex}:${ref.eventId}`));
  const aiRefs = aiEvents
    .filter((event) => isAiTournamentContextEvent(event, player, context.phase))
    .filter((event) => !existing.has(`${context.phase}:${context.stageIndex}:${event.id}`))
    .map((event): TournamentContextEventRef => ({
      eventId: event.id,
      phase: context.phase,
      stageIndex: context.stageIndex,
      priority: context.stakesLevel + context.pressureLevel + 4,
      expiresAtRound: context.phase === 'post-match' ? player.round + 2 : undefined,
      generatedEvent: event,
    }));

  if (aiRefs.length === 0) return context;

  const nextContext = {
    ...context,
    contextEventQueue: [...context.contextEventQueue, ...aiRefs],
  };
  player.tournamentContext = nextContext;
  return nextContext;
}

function isAiTournamentContextEvent(
  event: EventDef,
  player: Player,
  _phase: TournamentContextPhase,
): boolean {
  return event.id.startsWith('ai-') &&
    event.type === 'tournament-context' &&
    event.stages.includes(player.stage);
}

export function markTournamentContextEventConsumed(player: Player, eventId: string): Player {
  const context = player.tournamentContext;
  if (!context) return player;
  const canonicalEventId = canonicalTournamentContextEventId(eventId);
  const isContextEvent = canonicalEventId.startsWith('tournament-context-') ||
    context.contextEventQueue.some((ref) => canonicalTournamentContextEventId(ref.eventId) === canonicalEventId);
  if (!isContextEvent) return player;

  const consumed = context.consumedContextEventIds.includes(canonicalEventId)
    ? context.consumedContextEventIds
    : [...context.consumedContextEventIds, canonicalEventId];
  return {
    ...player,
    tournamentContext: {
      ...context,
      consumedContextEventIds: consumed,
      contextEventQueue: context.contextEventQueue
        .filter((ref) => canonicalTournamentContextEventId(ref.eventId) !== canonicalEventId),
    },
  };
}

export function advanceTournamentContextStage(
  player: Player,
  pendingMatch: PendingMatch,
  tournament: Tournament,
): Player {
  const existing = player.tournamentContext;
  if (!existing) return player;
  const nextContext: TournamentContext = {
    ...existing,
    tournamentId: pendingMatch.tournamentId,
    stageIndex: pendingMatch.stageIndex,
    resolveYear: pendingMatch.resolveYear,
    resolveWeek: pendingMatch.resolveWeek,
    phase: 'pre-match',
    pressureLevel: pressureLevelForTournament(tournament, player),
    stakesLevel: stakesLevelForTournament(tournament),
  };
  return {
    ...player,
    tournamentContext: {
      ...nextContext,
      contextEventQueue: enqueueTournamentContextCandidates(nextContext, player, ['pre-match']),
    },
  };
}

export function recordTournamentContextMatchResult(
  player: Player,
  matchStats: MatchStats | undefined,
  won: boolean,
  isFinalStage: boolean,
  isChampion: boolean,
  aiEvents: EventDef[] = [],
): Player {
  const context = player.tournamentContext;
  if (!context) return player;

  const result: TournamentContextMatchResult = {
    won,
    isFinalStage,
    teamScore: matchStats?.teamScore ?? 0,
    enemyScore: matchStats?.enemyScore ?? 0,
    kills: matchStats?.kills ?? 0,
    deaths: matchStats?.deaths ?? 0,
    assists: matchStats?.assists ?? 0,
    rating: matchStats?.rating ?? 1,
    headshotRate: matchStats?.headshotRate ?? 0,
  };

  const contextWithResult: TournamentContext = {
    ...context,
    phase: 'post-match',
    lastMatchResult: result,
    expiresAtRound: player.round + 2,
  };
  const playerWithResult: Player = {
    ...player,
    tournamentContext: contextWithResult,
  };

  const nextContext: TournamentContext = {
    ...contextWithResult,
    contextEventQueue: [
      ...context.contextEventQueue,
      ...postMatchRefs(contextWithResult, playerWithResult, won, isChampion, isFinalStage, aiEvents),
    ],
  };

  return {
    ...player,
    tournamentContext: nextContext,
  };
}

export function cleanupTournamentContext(player: Player): Player {
  const context = player.tournamentContext;
  if (!context) return player;
  if (context.expiresAtRound !== undefined && player.round > context.expiresAtRound) {
    const { tournamentContext, ...rest } = player;
    return rest as Player;
  }
  if (!player.pendingMatch && context.contextEventQueue.length === 0) {
    const { tournamentContext, ...rest } = player;
    return rest as Player;
  }
  return player;
}

export function normalizeTournamentContextPhase(player: Player): TournamentContext | undefined {
  const context = player.tournamentContext;
  const pendingMatch = player.pendingMatch;
  if (!context) return undefined;
  if (!pendingMatch) return context.phase === 'post-match' ? context : context;
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const weeksUntilMatch = (pendingMatch.resolveYear - currentYear) * 48 + (pendingMatch.resolveWeek - currentWeek);
  const phase: TournamentContextPhase = weeksUntilMatch <= 0
    ? 'match'
    : weeksUntilMatch === 1
      ? 'pre-match'
      : 'signup';
  return {
    ...context,
    stageIndex: pendingMatch.stageIndex,
    resolveYear: pendingMatch.resolveYear,
    resolveWeek: pendingMatch.resolveWeek,
    phase,
  };
}

function enqueueTournamentContextCandidates(
  context: TournamentContext,
  player: Player,
  phases: TournamentContextPhase[],
): TournamentContextEventRef[] {
  const existing = new Set(context.contextEventQueue.map((ref) => `${ref.phase}:${ref.stageIndex}:${ref.eventId}`));
  const refs: TournamentContextEventRef[] = [...context.contextEventQueue];
  for (const event of TOURNAMENT_CONTEXT_EVENTS) {
    for (const phase of phases) {
      if (!event.contextPhase.includes(phase)) continue;
      if (!tournamentContextEventMatches(event, player, phase)) continue;
      const key = `${phase}:${context.stageIndex}:${event.id}`;
      if (existing.has(key)) continue;
      refs.push({
        eventId: event.id,
        phase,
        stageIndex: context.stageIndex,
        priority: priorityForEvent(event, context, phase),
        expiresAtRound: phase === 'post-match' ? player.round + 2 : undefined,
      });
      existing.add(key);
    }
  }
  return refs;
}

function postMatchRefs(
  context: TournamentContext,
  player: Player,
  won: boolean,
  isChampion: boolean,
  isFinalStage: boolean,
  aiEvents: EventDef[] = [],
): TournamentContextEventRef[] {
  const handAuthored = TOURNAMENT_CONTEXT_EVENTS
    .filter((event) => event.contextPhase.includes('post-match'))
    .filter((event) => {
      if (event.requireMatchResult === 'win' && !won) return false;
      if (event.requireMatchResult === 'loss' && won) return false;
      if (event.requireChampion && !isChampion) return false;
      return tournamentContextEventMatches(event, player, 'post-match');
    });

  const aiPostMatch = aiEvents
    .filter((event) => isAiTournamentContextEvent(event, player, 'post-match'))
    .filter((event) => event.type === 'tournament-context')
    .map((event) => event as EventDef & { contextPhase?: TournamentContextPhase[] })
    .filter((event) => event.contextPhase?.includes('post-match') ?? false);

  const selected = won
    ? handAuthored
    : selectPostMatchEvents(handAuthored, aiPostMatch, context, player, isFinalStage);

  return selected.map((event) => ({
    eventId: event.id,
    phase: 'post-match' as const,
    stageIndex: context.stageIndex,
    priority: 'contextPhase' in event && event.type === 'tournament-context'
      ? priorityForEvent(event as TournamentContextEventDef, context, 'post-match')
      : context.stakesLevel + context.pressureLevel,
    expiresAtRound: player.round + 2,
    generatedEvent: event.id.startsWith('ai-') ? event : undefined,
  }));
}

function selectPostMatchEvents(
  handAuthored: TournamentContextEventDef[],
  aiEvents: EventDef[],
  context: TournamentContext,
  player: Player,
  isFinalStage: boolean,
): Array<TournamentContextEventDef | EventDef> {
  const maxEvents = isFinalStage ? 3 : 2;
  const selected: Array<TournamentContextEventDef | EventDef> = [];
  const usedGroups = new Set<TournamentContextEventGroup | 'ai-filler'>();
  let hasSevereNegative = false;
  let hasGrowthEvent = false;

  const sorted = [...handAuthored].sort((a, b) => {
    const groupDiff = postMatchGroupRank(a.group) - postMatchGroupRank(b.group);
    if (groupDiff !== 0) return groupDiff;
    return priorityForEvent(b, context, 'post-match') - priorityForEvent(a, context, 'post-match');
  });

  for (const event of sorted) {
    if (selected.length >= maxEvents) break;
    const group = event.group ?? 'generic-review';
    if (usedGroups.has(group)) continue;
    if (!isFinalStage && conflictsWithSelectedPostMatchEvent(event, selected)) continue;
    if (event.isSevereNegative && hasSevereNegative) continue;
    if (event.isGrowthEvent && hasGrowthEvent) continue;
    selected.push(event);
    usedGroups.add(group);
    hasSevereNegative = hasSevereNegative || event.isSevereNegative === true;
    hasGrowthEvent = hasGrowthEvent || event.isGrowthEvent === true;
  }

  if (selected.length === 0) {
    const fallback = handAuthored.find((event) => event.id === 'tournament-context-loss-demo-review');
    if (fallback) {
      selected.push(fallback);
      usedGroups.add(fallback.group ?? 'generic-review');
      hasGrowthEvent = hasGrowthEvent || fallback.isGrowthEvent === true;
    }
  }

  if (selected.length < maxEvents && player.team && !usedGroups.has('team-rally')) {
    const rally = handAuthored.find((event) => event.id === 'tournament-context-loss-team-rally');
    if (rally && (isFinalStage || !conflictsWithSelectedPostMatchEvent(rally, selected))) {
      selected.push(rally);
      usedGroups.add('team-rally');
    }
  }

  for (const event of aiEvents) {
    if (selected.length >= maxEvents) break;
    if (usedGroups.has('ai-filler')) continue;
    selected.push(event);
    usedGroups.add('ai-filler');
  }

  return selected.slice(0, maxEvents);
}

function conflictsWithSelectedPostMatchEvent(
  event: TournamentContextEventDef,
  selected: Array<TournamentContextEventDef | EventDef>,
): boolean {
  const ids = new Set(selected.map((candidate) => candidate.id));
  if (event.id === 'tournament-context-loss-locker-blame' && ids.has('tournament-context-loss-team-rally')) return true;
  if (event.id === 'tournament-context-loss-team-rally' && ids.has('tournament-context-loss-locker-blame')) return true;
  return false;
}

function postMatchGroupRank(group: TournamentContextEventGroup | undefined): number {
  switch (group) {
    case 'elimination': return 0;
    case 'blowout-loss': return 1;
    case 'close-loss': return 1;
    case 'player-carried': return 2;
    case 'player-underperformed': return 2;
    case 'team-conflict': return 3;
    case 'team-rally': return 3;
    case 'public-pressure': return 4;
    case 'generic-review': return 5;
    default: return 6;
  }
}

function tournamentContextEventMatches(
  event: EventDef | TournamentContextEventDef,
  player: Player,
  phase: TournamentContextPhase,
): boolean {
  if (!('contextPhase' in event)) return false;
  if (!event.contextPhase.includes(phase)) return false;
  if (!event.stages.includes(player.stage)) return false;
  if (event.requireTeam && !player.team) return false;
  if (event.requireNoTeam && player.team) return false;
  if (event.minStress !== undefined && (player.stress ?? 0) < event.minStress) return false;
  if (event.minFatigue !== undefined && (player.volatile?.fatigue ?? 0) < event.minFatigue) return false;
  if (event.maxTeamTrust !== undefined && (player.teamTrust ?? 0) > event.maxTeamTrust) return false;
  if (!postMatchConditionsMatch(event, player, phase)) return false;
  if (event.travelRequired) {
    const travel = pendingAwayTournamentTravelContext(player);
    if (!travel) return false;
    if (event.travelRequired === 'city' && !travel.hasCityVenue) return false;
    if (event.travelRequired === 'cross-region' && travel.distance !== 'cross-region') return false;
  }
  return true;
}

function postMatchConditionsMatch(
  event: EventDef | TournamentContextEventDef,
  player: Player,
  phase: TournamentContextPhase,
): boolean {
  if (phase !== 'post-match' || !('contextPhase' in event)) return true;
  const hasPostMatchConditions = hasDirectPostMatchCondition(event) ||
    (event.postMatchAny !== undefined && event.postMatchAny.length > 0) ||
    event.minRecentTournamentLosses !== undefined ||
    event.requireFinalStage !== undefined;
  if (!hasPostMatchConditions) return true;

  const result = player.tournamentContext?.lastMatchResult;
  if (!result) return false;

  if (event.requireFinalStage !== undefined && result.isFinalStage !== event.requireFinalStage) return false;
  if (event.minRecentTournamentLosses !== undefined &&
    (player.consecutiveLosses ?? 0) < event.minRecentTournamentLosses) return false;
  if (!postMatchConditionMatches(event, result)) return false;
  if (event.postMatchAny && event.postMatchAny.length > 0 &&
    !event.postMatchAny.some((condition) => postMatchConditionMatches(condition, result))) {
    return false;
  }
  return true;
}

function hasDirectPostMatchCondition(event: TournamentContextEventDef): boolean {
  return event.minTeamScore !== undefined ||
    event.maxTeamScore !== undefined ||
    event.minEnemyScore !== undefined ||
    event.maxEnemyScore !== undefined ||
    event.minRoundDiff !== undefined ||
    event.maxRoundDiff !== undefined ||
    event.minPlayerRating !== undefined ||
    event.maxPlayerRating !== undefined ||
    event.minKdDiff !== undefined ||
    event.maxKdDiff !== undefined;
}

function postMatchConditionMatches(
  condition: TournamentContextPostMatchCondition,
  result: TournamentContextMatchResult,
): boolean {
  const roundDiff = Math.abs(result.teamScore - result.enemyScore);
  const kdDiff = result.kills - result.deaths;
  if (condition.minTeamScore !== undefined && result.teamScore < condition.minTeamScore) return false;
  if (condition.maxTeamScore !== undefined && result.teamScore > condition.maxTeamScore) return false;
  if (condition.minEnemyScore !== undefined && result.enemyScore < condition.minEnemyScore) return false;
  if (condition.maxEnemyScore !== undefined && result.enemyScore > condition.maxEnemyScore) return false;
  if (condition.minRoundDiff !== undefined && roundDiff < condition.minRoundDiff) return false;
  if (condition.maxRoundDiff !== undefined && roundDiff > condition.maxRoundDiff) return false;
  if (condition.minPlayerRating !== undefined && result.rating < condition.minPlayerRating) return false;
  if (condition.maxPlayerRating !== undefined && result.rating > condition.maxPlayerRating) return false;
  if (condition.minKdDiff !== undefined && kdDiff < condition.minKdDiff) return false;
  if (condition.maxKdDiff !== undefined && kdDiff > condition.maxKdDiff) return false;
  return true;
}

function priorityForEvent(
  event: TournamentContextEventDef,
  context: TournamentContext,
  phase: TournamentContextPhase,
): number {
  let priority = context.stakesLevel + context.pressureLevel;
  if (phase === 'signup') priority += 1;
  if (phase === 'post-match') priority += 2;
  if (event.requireChampion) priority += 3;
  if (event.requireMatchResult) priority += 2;
  if (event.travelRequired) priority += 2;
  return priority;
}

function canonicalTournamentContextEventId(eventId: string): string {
  if (eventId === 'tournament-context-post-loss-blame') return 'tournament-context-loss-locker-blame';
  return eventId;
}

function stakesLevelForTournament(tournament: Tournament): number {
  if (tournament.tier === 'major') return 5;
  if (tournament.tier === 's-open' || tournament.tier === 's-closed' || tournament.tier === 's-class') return 4;
  if (tournament.tier === 'a') return 3;
  if (tournament.tier === 'b') return 2;
  return 1;
}

function pressureLevelForTournament(tournament: Tournament, player: Player): number {
  let pressure = stakesLevelForTournament(tournament);
  if ((player.stress ?? 0) >= 70) pressure += 1;
  if ((player.volatile?.fatigue ?? 0) >= 70) pressure += 1;
  if (player.team && (player.teamTrust ?? 50) < 40) pressure += 1;
  return pressure;
}
