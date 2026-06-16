import { TOURNAMENT_CONTEXT_EVENTS, type TournamentContextEventDef } from '../data/events/tournamentContext.js';
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
  if (!context || !player.pendingMatch) return null;
  if (context.phase === 'match' || context.phase === 'complete') return null;

  const queue = [...context.contextEventQueue]
    .filter((ref) => ref.phase === context.phase)
    .filter((ref) => ref.stageIndex === context.stageIndex)
    .filter((ref) => !ref.expiresAtRound || ref.expiresAtRound >= player.round)
    .sort((a, b) => b.priority - a.priority);

  for (const ref of queue) {
    if (context.consumedContextEventIds.includes(ref.eventId)) continue;
    const event = ref.generatedEvent ??
      TOURNAMENT_CONTEXT_EVENTS.find((candidate) => candidate.id === ref.eventId);
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
  const isContextEvent = eventId.startsWith('tournament-context-') ||
    context.contextEventQueue.some((ref) => ref.eventId === eventId);
  if (!isContextEvent) return player;

  const consumed = context.consumedContextEventIds.includes(eventId)
    ? context.consumedContextEventIds
    : [...context.consumedContextEventIds, eventId];
  return {
    ...player,
    tournamentContext: {
      ...context,
      consumedContextEventIds: consumed,
      contextEventQueue: context.contextEventQueue.filter((ref) => ref.eventId !== eventId),
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

  const nextContext: TournamentContext = {
    ...context,
    phase: 'post-match',
    lastMatchResult: result,
    expiresAtRound: player.round + 2,
    contextEventQueue: [
      ...context.contextEventQueue,
      ...postMatchRefs(context, player, won, isChampion),
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
  const isMatchWeek =
    pendingMatch.resolveYear === (player.year ?? 1) &&
    pendingMatch.resolveWeek === (player.week ?? 1);
  const phase: TournamentContextPhase = isMatchWeek
    ? 'match'
    : context.phase === 'signup' && player.round === context.signedUpAtRound
      ? 'signup'
      : 'pre-match';
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
): TournamentContextEventRef[] {
  return TOURNAMENT_CONTEXT_EVENTS
    .filter((event) => event.contextPhase.includes('post-match'))
    .filter((event) => {
      if (event.requireMatchResult === 'win' && !won) return false;
      if (event.requireMatchResult === 'loss' && won) return false;
      if (event.requireChampion && !isChampion) return false;
      return tournamentContextEventMatches(event, player, 'post-match');
    })
    .map((event) => ({
      eventId: event.id,
      phase: 'post-match' as const,
      stageIndex: context.stageIndex,
      priority: priorityForEvent(event, context, 'post-match'),
      expiresAtRound: player.round + 2,
    }));
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
  return priority;
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
