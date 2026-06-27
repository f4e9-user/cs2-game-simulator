import {
  type Tournament,
  getTournament,
  stageRewardDelta,
  synthesizeMatchEvent,
  tournamentStageEliminationLosses,
} from '../data/tournaments.js';
import { generateSingleTeammate } from '../data/roster.js';
import { addPlayerPoints, buildLeaderboard } from '../data/leaderboard.js';
import { getEventById } from '../data/events/index.js';
import { roleFitScore } from '../data/roleProfiles.js';
import { deriveRolePressure } from './roleTransition.js';
import { getTrait } from '../data/traits.js';
import {
  aggregateSeriesMatchResult,
  applyForcedMatchResult,
  buildMatchResolveResult,
  buildTournamentForfeitResolveResult,
  buildTournamentMapResolveResult,
  injuryAdjustedPlayer,
  matchSimToTournamentMapResult,
} from './match.js';
import { checkEnding } from './ending.js';
import {
  createInitialPendingDeparture,
  recalcPendingDeparture,
  shouldTriggerPendingDeparture,
} from './departure.js';
import {
  adjustRosterChemistry,
  applyTargetTeammateChemistryDelta,
  calcTrustRateMultiplier,
  settleSalaryOnDeparture,
} from './team.js';
import { applyInjuryRiskTick } from './action.js';
import {
  clubApplicationRollBonus,
  generateTeamOffer,
  joinTeamFromOffer,
  pickPromotionClub,
} from './club.js';
import { advanceWeek } from './calendar.js';
import { rolloverRoutineActions } from './routineActions.js';
import {
  applyAutomaticTagCleanup,
  refreshTagExpiry,
} from './tags.js';
import {
  consumeMatchBuffsForScope,
  matchBuffsForScope,
  playerWithSeriesBuffSnapshot,
} from './matchBuffs.js';
import { processRecoverySystems } from './recovery.js';
import {
  championshipSeriesKeys,
  championshipTierKeys,
} from './tournamentProgress.js';
import {
  buildSequencePromptEvent,
  createAiSequenceFromEvent,
  createNarrativeSequence,
  restoreTournamentSeriesSequenceFromEvent,
} from './choiceSequences.js';
import { assertNoActiveEventSequence } from './phase.js';
import {
  clampFame,
  clampFatigue,
  clampFeel,
  clampStress,
  clampTeamTrust,
  clampTilt,
  dedupe,
  hashString,
  nowIso,
} from './utils.js';
import type {
  Buff,
  ChoiceDef,
  EventDef,
  GameEventPublic,
  GameSession,
  LeaderboardTeam,
  MatchStats,
  Player,
  RoundResult,
  Stats,
  TeammateRole,
  WeeklyNewsItem,
} from '../types.js';
import {
  BROKE_MENTALITY_DRAIN,
  CAREER_TIME_EXPERIENCE_RAW,
  CONSTITUTION_COLLAPSE,
  FEEL_CAP_DEFAULT,
  GROWTH_CAP,
  IMPLICIT_FAILURE_STRESS,
  INJURY_REST_ROUNDS,
  LEGEND_FAME_THRESHOLD,
  MAX_ROUNDS,
  STAT_KEYS,
  STRESS_GRACE_ROUNDS,
  STRESS_MAX,
  TEAMMATE_GROWTH_CAP,
  growthFactor,
  passiveStressFromMentality,
} from './constants.js';
import { buildInjuryAwareTournamentEvent, buildTournamentPrepEvent, pickEvent, ROLE_STAT_REQUIREMENT, substituteRivals, substituteTeammates, toPublicEvent } from './events.js';
import {
  advanceEventSequence,
  getCurrentSequenceStep,
  isSequenceFinalStep,
  resolveSequenceEventForStep,
  sequenceResultFields,
} from './eventSequence.js';
import { checkTournamentPromotion } from './stages.js';
import {
  applyDelta,
  applyCareerExperienceGrowth,
  makeRng,
  outcomeEffects,
  outcomeProgression,
  outcomeResourceDelta,
  outcomeStateDelta,
  outcomeTags,
  resolveChoice,
} from './resolver.js';
import { type MatchSimResult, simulateMatch } from './matchSimulator.js';
import { applyStateDeltaModifiers, consumeTriggeredBuffs } from './stateModifiers.js';
import { applyMoneyTransaction } from './money.js';
import {
  buildAiPickCandidates,
  resolveAiEventById,
  type AiEventCacheEnvelope,
} from '../ai/eventCache.js';
import {
  addQualificationRewardsByOwnerWithExpiry,
  clearTeamQualifications,
  defaultQualificationExpiry,
  expireQualificationBatches,
  formatQualificationRewards,
  normalizeQualificationBatches,
} from './qualification.js';
import {
  refreshVisibleTeamIdentities,
} from './teamIdentity.js';
import {
  advanceTournamentContextStage,
  cleanupTournamentContext,
  markTournamentContextEventConsumed,
  recordTournamentContextMatchResult,
} from './tournamentContext.js';
import {
  composeRoundPlan,
  deriveRecentThemeGroups,
  markRoundPlanServed,
  reconcileRoundPlan,
  roundPlanCountRemaining,
} from './roundPlan.js';
import type { RoundPlan } from '../types.js';
import { pickRoundEvent } from './events.js';
import {
  createTournamentSeriesSequence,
  requiredWins,
  type TournamentMapResult,
  type TournamentSeriesContext,
} from './tournamentSeries.js';
import {
  assignPendingMatchOpponent,
  activateClubRuntime,
  recordWorldTournamentResult,
  resolveClubDisplayInfo,
  tickWorldClubRuntimes,
} from './worldClubs.js';
import { buildWorldTournamentNews } from './worldNews.js';

const PROMOTION_DECLINE_COOLDOWN_ROUNDS = 4;
const CLUB_INTERVIEW_IDS = new Set([
  'chain-club-interview',
  'chain-club-interview-open-match',
  'chain-club-interview-talent',
]);
type EventImportance = 'critical' | 'important' | 'minor' | 'news' | 'background';

function isNewsOnlyEvent(event: EventDef): boolean {
  return event.type === 'broadcast' ||
    event.id.startsWith('broadcast-') ||
    (event.requireTags ?? []).includes('major-broadcast');
}

function eventImportance(event: EventDef): EventImportance {
  if (event.severity) return event.severity;
  if (isNewsOnlyEvent(event)) return 'news';
  if (
    event.type === 'match' ||
    event.type === 'tournament-context' ||
    event.type === 'bailout' ||
    event.id.startsWith('promotion-') ||
    event.id.startsWith('tourney-') ||
    event.id === 'family-crisis-illness' ||
    event.id === 'chain-team-conflict'
  ) {
    return 'critical';
  }
  if (
    event.type === 'team' ||
    event.type === 'tryout' ||
    event.type === 'chains' ||
    event.type === 'agent' ||
    event.type === 'stress'
  ) {
    return 'important';
  }
  return 'minor';
}

function toWeeklyNewsItem(event: EventDef, session: GameSession): WeeklyNewsItem {
  const publicEvent = toPublicEvent(event, session.player.rivals, session.player.roster ?? []);
  return {
    id: `${session.player.round ?? 0}-${event.id}`,
    eventId: event.id,
    type: event.type,
    title: publicEvent.title,
    narrative: publicEvent.narrative,
    createdAt: nowIso(),
  };
}

function clubName(session: GameSession, clubId: string): string {
  const info = resolveClubDisplayInfo(session, clubId);
  if (!info) return '未知战队';
  return `${info.name} (${info.tag})`;
}

function buildWorldNewsForRound(session: GameSession): WeeklyNewsItem[] {
  const existingIds = new Set((session.weeklyNews ?? []).map((item) => item.eventId));
  const summaries = session.worldClubs?.seasonSummaries ?? [];
  const items: WeeklyNewsItem[] = [];
  for (const summary of summaries) {
    const eventId = `world-club-season-summary:${summary.season}:${summary.round}`;
    if (existingIds.has(eventId)) continue;
    const segments: string[] = [];
    if (summary.darkHorseClubIds.length > 0) {
      segments.push(`${clubName(session, summary.darkHorseClubIds[0]!)} 成为本赛季黑马`);
    }
    if (summary.promotedClubIds.length > 0) {
      segments.push(`${clubName(session, summary.promotedClubIds[0]!)} 完成升级`);
    }
    if (summary.fallenClubIds.length > 0) {
      segments.push(`${clubName(session, summary.fallenClubIds[0]!)} 排名下滑`);
    }
    if (summary.majorNewFaceClubIds.length > 0) {
      segments.push(`${clubName(session, summary.majorNewFaceClubIds[0]!)} 拿到大赛机会`);
    }
    if (segments.length === 0) continue;
    items.push({
      id: eventId,
      eventId,
      type: 'broadcast',
      title: '世界战队赛季动态',
      narrative: segments.join('，') + '。',
      source: {
        kind: 'world-club-season',
        year: summary.season,
        week: ((Math.max(1, summary.round) - 1) % 48) + 1,
        resultId: eventId,
      },
      createdAt: nowIso(),
    });
  }
  const tournamentNews = buildWorldTournamentNews(session);
  for (const item of tournamentNews) {
    if (existingIds.has(item.eventId) || items.some((entry) => entry.eventId === item.eventId)) continue;
    items.push(item);
  }
  return items;
}

function pendingQueuedEvents(session: GameSession): GameEventPublic[] {
  return session.queuedEvents ?? [];
}

function buildLegacyAiFallbackEvent(event: GameEventPublic): EventDef {
  const choices = event.choices.length > 0 ? event.choices : [{
    id: 'continue',
    label: '继续',
    description: '继续处理这条旧 AI 事件',
  }];

  return {
    id: event.id,
    type: event.type,
    title: event.title || '临时事件',
    narrative: event.narrative || '旧存档中的 AI 事件已失效，系统使用兼容事件继续结算。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 0,
    choices: choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      description: choice.description,
      check: {
        primary: 'mentality',
        dc: 0,
      },
      success: {
        narrative: '你把这件事先处理完了。',
      },
      failure: {
        narrative: '你把这件事先勉强处理过去。',
      },
    })),
  };
}

function buildWeeklyEventSeed(
  session: GameSession,
  recentThemeGroups: ReturnType<typeof deriveRecentThemeGroups>,
  aiEvents?: EventDef[],
  aiEventCache?: AiEventCacheEnvelope,
): { pickedEvent: EventDef | null; newsItems: WeeklyNewsItem[] } {
  const newsItems: WeeklyNewsItem[] = [...buildWorldNewsForRound(session)];
  const excludedEventIds = new Set<string>();
  const recentEventIds = session.history.slice(-2).map((r) => r.eventId);
  let pickedEvent: EventDef | null = null;
  while (true) {
    const candidate = pickEvent({
      player: session.player,
      recentEventIds: [...recentEventIds, ...excludedEventIds],
      rng: makeRng(hashString(`${session.id}:${session.player.round}:${[...excludedEventIds].join(':')}:queue`)),
      leaderboard: session.leaderboard,
      aiEvents,
      aiEventCandidates: buildAiPickCandidates(aiEventCache, session.player, session.history),
      excludedEventIds: [...excludedEventIds],
      recentThemeGroups,
    });
    if (!candidate) break;
    excludedEventIds.add(candidate.id);
    const importance = eventImportance(candidate);
    if (importance === 'news') {
      newsItems.push(toWeeklyNewsItem(candidate, session));
      continue;
    }
    if (importance === 'background') continue;
    if (!pickedEvent) {
      pickedEvent = candidate;
    }
  }
  return { pickedEvent, newsItems };
}

function continueWithQueuedEvents(
  session: GameSession,
  nextPlayer: Player,
  result: RoundResult,
  ending: string | undefined,
  worldSession: GameSession,
  leaderboard: LeaderboardTeam[],
): { session: GameSession; result: RoundResult } {
  const [nextEvent, ...restQueuedEvents] = pendingQueuedEvents(session);
  const updated: GameSession = {
    ...worldSession,
    player: nextPlayer,
    phase: nextEvent ? 'event' : 'action',
    currentEvent: nextEvent ?? null,
    queuedEvents: restQueuedEvents,
    weeklyNews: session.weeklyNews ?? [],
    activeEventSequence: undefined,
    roundPlan: undefined,
    history: [...session.history, result],
    status: ending ? 'ended' : 'active',
    ending: ending ?? session.ending,
    updatedAt: nowIso(),
    leaderboard,
  };
  return { session: updated, result };
}

function shouldContinueRound(plan: RoundPlan | undefined, ending: string | undefined): boolean {
  return Boolean(plan && plan.targetCount > plan.servedCount && !ending);
}

function continueWithRoundPlan(
  session: GameSession,
  nextPlayer: Player,
  result: RoundResult,
  ending: string | undefined,
  worldSession: GameSession,
  leaderboard: LeaderboardTeam[],
  aiEvents?: EventDef[],
  aiEventCache?: AiEventCacheEnvelope,
): { session: GameSession; result: RoundResult } | null {
  const reconciled = reconcileRoundPlan(session.roundPlan, nextPlayer, result);
  if (!reconciled || !shouldContinueRound(reconciled, ending)) return null;

  const recentEventIds = [...session.history.slice(-2).map((r) => r.eventId), ...(reconciled?.servedEventIds ?? [])];
  const recentThemeGroups = deriveRecentThemeGroups(session.history);
  let excludedEventIds = new Set<string>(reconciled?.servedEventIds ?? []);
  let pickedEvent: EventDef | null = null;

  for (let attempts = 0; attempts < 12; attempts += 1) {
    const candidate = pickRoundEvent({
      player: nextPlayer,
      recentEventIds,
      rng: makeRng(hashString(`${session.id}:${nextPlayer.round}:${[...excludedEventIds].join(':')}:round-plan`)),
      leaderboard: worldSession.leaderboard,
      aiEvents,
      aiEventCandidates: buildAiPickCandidates(aiEventCache, nextPlayer, session.history),
      excludedEventIds: [...excludedEventIds],
      recentThemeGroups,
    }, reconciled);
    if (!candidate) break;
    const importance = eventImportance(candidate);
    excludedEventIds.add(candidate.id);
    if (importance === 'news' || importance === 'background') {
      continue;
    }
    pickedEvent = candidate;
    break;
  }

  if (!pickedEvent || !reconciled) return null;

  const nextPlan = markRoundPlanServed(reconciled, pickedEvent);
  const presentation = prepareRoundEventPresentation(
    { ...worldSession, player: nextPlayer, activeEventSequence: undefined },
    pickedEvent,
  );
  const updated: GameSession = {
    ...worldSession,
    player: nextPlayer,
    phase: presentation.currentEvent ? 'event' : 'action',
    currentEvent: presentation.currentEvent,
    queuedEvents: [],
    weeklyNews: session.weeklyNews ?? [],
    activeEventSequence: presentation.activeEventSequence,
    roundPlan: nextPlan,
    history: [...session.history, result],
    status: ending ? 'ended' : 'active',
    ending: ending ?? session.ending,
    updatedAt: nowIso(),
    leaderboard,
  };
  return { session: updated, result };
}

function pickClubInterviewEvent(player: Player): EventDef | null {
  const preferredIds = [
    player.tags.includes('application-path-open-match') ? 'chain-club-interview-open-match' : null,
    player.tags.includes('application-path-talent') ? 'chain-club-interview-talent' : null,
    'chain-club-interview',
  ].filter((id): id is string => Boolean(id));

  for (const eventId of preferredIds) {
    const event = getEventById(eventId);
    if (event && event.stages.includes(player.stage)) return event;
  }
  return null;
}

function createClubInterviewSequence(player: Player, finalInterviewEvent: EventDef, includeInvitePrompt = false): NonNullable<GameSession['activeEventSequence']> {
  const round = player.round ?? 0;
  return createNarrativeSequence(
    `club-interview-${round}`,
    'club-interview',
    round,
    [
      ...(includeInvitePrompt
        ? [
            buildSequencePromptEvent(
              `club-interview-${round}-invite`,
              'tryout',
              '线下面试邀请',
              '回信里写得很明确：他们想约你线下聊一次。你确认时间地点，准备进入正式面试。',
            ),
          ]
        : []),
      buildSequencePromptEvent(
        `club-interview-${round}-question-1`,
        'tryout',
        '面试问题：你的定位',
        '战队没有马上进入合同细节，而是先问你怎么看自己的队内定位。',
      ),
      buildSequencePromptEvent(
        `club-interview-${round}-question-2`,
        'tryout',
        '面试问题：压力和目标',
        '第二个问题更直接：如果成绩不顺，你准备怎么证明自己值得这个名额。',
      ),
      finalInterviewEvent,
    ],
  );
}

function prepareRoundEventPresentation(
  session: GameSession,
  pickedEvent: EventDef | null,
): {
  activeEventSequence?: NonNullable<GameSession['activeEventSequence']>;
  currentEvent: GameEventPublic | null;
  presentedEvent: EventDef | null;
} {
  let activeEventSequence = session.activeEventSequence;
  let eventToPresent = pickedEvent;
  const nextPlayer = session.player;

  const tournamentMatch = eventToPresent ? /^tournament-(.+)--(\d+)$/.exec(eventToPresent.id) : null;
  if (tournamentMatch) {
    const tournament = getTournament(tournamentMatch[1]!);
    const stageIndex = parseInt(tournamentMatch[2]!, 10);
    const stage = tournament?.bracket[stageIndex];
    if (tournament && stage && (stage.seriesType === 'bo3' || stage.seriesType === 'bo5')) {
      activeEventSequence = {
        ...createTournamentSeriesSequence(tournament, stageIndex, matchBuffsForScope(nextPlayer.buffs ?? [], 'series')),
        startedRound: nextPlayer.round,
      };
      eventToPresent = activeEventSequence.steps[0]?.generatedEvent ?? eventToPresent;
    }
  }
  if (!activeEventSequence && eventToPresent && CLUB_INTERVIEW_IDS.has(eventToPresent.id)) {
    activeEventSequence = createClubInterviewSequence(nextPlayer, eventToPresent);
    eventToPresent = activeEventSequence.steps[0]?.generatedEvent ?? eventToPresent;
  }
  if (!activeEventSequence && eventToPresent?.id === 'family-crisis-illness') {
    activeEventSequence = createNarrativeSequence(
      `family-crisis-${nextPlayer.round}`,
      'family-crisis',
      nextPlayer.round,
      [
        buildSequencePromptEvent(
          `family-crisis-${nextPlayer.round}-call`,
          'life',
          '家里的未接来电',
          '训练间隙，手机屏幕亮了又灭。家里连续打来几个电话，你意识到这不是普通问候。',
        ),
        buildSequencePromptEvent(
          `family-crisis-${nextPlayer.round}-pressure`,
          'life',
          '需要立刻决定',
          '消息讲清楚后，压力一下压到眼前。你必须决定职业节奏和家里状况哪个先处理。',
        ),
        eventToPresent,
      ],
    );
    eventToPresent = activeEventSequence.steps[0]?.generatedEvent ?? eventToPresent;
  }
  if (!activeEventSequence && eventToPresent?.id === 'chain-team-conflict') {
    activeEventSequence = createNarrativeSequence(
      `team-conflict-${nextPlayer.round}`,
      'team-conflict',
      nextPlayer.round,
      [
        buildSequencePromptEvent(
          `team-conflict-${nextPlayer.round}-review`,
          'team',
          '复盘室里的火药味',
          '复盘刚开始，几个关键回合就被反复拖回进度条。你能感觉到这次不是普通争论。',
        ),
        buildSequencePromptEvent(
          `team-conflict-${nextPlayer.round}-private`,
          'team',
          '私下表态',
          '会议暂停后，有人单独找你聊了几句。你知道接下来的表态会影响更衣室站位。',
        ),
        eventToPresent,
      ],
    );
    eventToPresent = activeEventSequence.steps[0]?.generatedEvent ?? eventToPresent;
  }
  if (!activeEventSequence && eventToPresent?.id.startsWith('ai-')) {
    const aiSequence = createAiSequenceFromEvent(eventToPresent, nextPlayer.round);
    if (aiSequence) {
      activeEventSequence = aiSequence;
      eventToPresent = activeEventSequence.steps[0]?.generatedEvent ?? eventToPresent;
    }
  }

  const transferTarget = nextPlayer.pendingDeparture
    ? (nextPlayer.roster ?? []).find((tm) => tm.id === nextPlayer.pendingDeparture!.slotId)?.name
    : undefined;

  return {
    activeEventSequence,
    presentedEvent: eventToPresent,
    currentEvent: eventToPresent
      ? toPublicEvent(eventToPresent, nextPlayer.rivals, nextPlayer.roster ?? [], transferTarget)
      : null,
  };
}

export interface ApplyChoiceResult {
  session: GameSession;
  result: RoundResult;
}

export function applyChoice(
  session: GameSession,
  choiceId: string,
  rollBonus = 0,
  aiEvents?: EventDef[],
  aiEventCache?: AiEventCacheEnvelope,
): ApplyChoiceResult {
  if (session.status !== 'active') throw new Error('session is not active');
  const sessionPhase = session.currentEvent ? 'event' : (session.phase ?? 'action');
  if (sessionPhase !== 'event') throw new Error('not in event phase');
  if (!session.currentEvent) throw new Error('no pending event on this session');
  const queuedEvents = pendingQueuedEvents(session);
  const roundPlan = session.roundPlan;

  const resolveEventById = (eventId: string): EventDef | null => getEventById(eventId) ??
    resolveAiEventById(aiEventCache, eventId) ??
    aiEvents?.find((e) => e.id === eventId) ??
    (session.currentEvent?.id === eventId && eventId.startsWith('ai-')
      ? buildLegacyAiFallbackEvent(session.currentEvent)
      : null) ??
    // Dynamically-generated prep events aren't in EVENT_POOL — reconstruct from pendingMatch
    (eventId.startsWith('tourney-prep-') && session.player.pendingMatch
      ? buildTournamentPrepEvent(session.player.pendingMatch)
      : eventId.startsWith('tourney-injury-') && session.player.pendingMatch
        ? buildInjuryAwareTournamentEvent(session.player.pendingMatch)
      : null);

  const activeSequence = session.activeEventSequence?.status === 'active'
    ? session.activeEventSequence
    : undefined;
  const restoredTournamentSeries = !activeSequence && session.currentEvent
    ? restoreTournamentSeriesSequenceFromEvent(session.currentEvent.id, session.player)
    : null;
  const effectiveActiveSequence = activeSequence ?? restoredTournamentSeries ?? undefined;
  const activeSequenceStep = effectiveActiveSequence ? getCurrentSequenceStep(effectiveActiveSequence) : null;
  if (effectiveActiveSequence && activeSequenceStep) {
    const activeStepEvent = resolveSequenceEventForStep(activeSequenceStep, resolveEventById);
    if (activeStepEvent && activeStepEvent.id !== session.currentEvent.id) {
      throw new Error('current event does not match active event sequence');
    }
  }
  if (effectiveActiveSequence && !activeSequenceStep) {
    throw new Error('active event sequence has no current step');
  }

  const eventDef = effectiveActiveSequence
    ? resolveSequenceEventForStep(activeSequenceStep!, resolveEventById)
    : resolveEventById(session.currentEvent.id);
  if (!eventDef) throw new Error(`unknown event: ${session.currentEvent.id}`);

  const choiceDef = eventDef.choices.find((c) => c.id === choiceId);
  if (!choiceDef) throw new Error(`unknown choice: ${choiceId}`);

  const traits = session.player.traits
    .map(getTrait)
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const effectiveRollBonus = rollBonus + clubApplicationRollBonus(session.player, eventDef.id);

  const rng = makeRng(hashString([
    session.id,
    session.player.round,
    eventDef.id,
    choiceDef.id,
    activeSequenceStep?.id ?? 'single',
  ].join(':')));

  // ── 比赛模拟拦截（tournament-* 事件走数值模拟而非 d20）──
  let pendingMatchSim: MatchSimResult | undefined;
  let tournamentSeriesMapResult: TournamentMapResult | undefined;
  let injuryMatchResolved = false;
  let injuryForfeit = false;
  const tournamentMatch = /^tournament-(.+)--(\d+)$/.exec(eventDef.id);

  const outcome = (() => {
    if (effectiveActiveSequence?.type === 'tournament-series' && activeSequenceStep?.dynamicEventKind === 'tournament-map') {
      const context = effectiveActiveSequence.context as unknown as TournamentSeriesContext;
      const t = getTournament(context.tournamentId);
      const stageIdx = context.stageIndex;
      const stage = t?.bracket[stageIdx];
      if (t && stage) {
        const matchPlayer = playerWithSeriesBuffSnapshot(session.player, context);
        const effectiveDiff = t.baseDifficulty + stage.difficultyBonus;
        pendingMatchSim = simulateMatch(matchPlayer, {
          tier: t.tier,
          progressionTier: t.progressionTier,
          entryType: t.entryType,
          stageIndex: stageIdx,
          effectiveDifficulty: effectiveDiff,
          opponent: session.player.pendingMatch?.opponent,
        }, rng);
        if (session.player.forceMatchResult) {
          pendingMatchSim = applyForcedMatchResult(pendingMatchSim, session.player.forceMatchResult);
        }
        const mapIndex = context.maps.length;
        const mapName = context.mapPool[mapIndex] ?? `Map ${mapIndex + 1}`;
        tournamentSeriesMapResult = matchSimToTournamentMapResult(mapIndex + 1, mapName, pendingMatchSim);
        return buildTournamentMapResolveResult(session.player, pendingMatchSim);
      }
    }

    if (effectiveActiveSequence?.type === 'tournament-series' && activeSequenceStep?.dynamicEventKind === 'tournament-series-decider') {
      const context = effectiveActiveSequence.context as unknown as TournamentSeriesContext;
      const t = getTournament(context.tournamentId);
      const stageIdx = context.stageIndex;
      if (t) {
        const matchPlayer = playerWithSeriesBuffSnapshot(session.player, context);
        pendingMatchSim = aggregateSeriesMatchResult(matchPlayer, context);
        const result = buildMatchResolveResult(matchPlayer, pendingMatchSim, t, stageIdx);
        return {
          ...result,
          seriesScore: {
            player: context.playerMapWins,
            opponent: context.opponentMapWins,
          },
        };
      }
    }

    if (eventDef.id.startsWith('tourney-injury-') && session.player.pendingMatch) {
      const t = getTournament(session.player.pendingMatch.tournamentId);
      const stageIdx = session.player.pendingMatch.stageIndex;
      const stage = t?.bracket[stageIdx];
      if (choiceDef.id === 'forfeit-injury') {
        injuryForfeit = true;
        return buildTournamentForfeitResolveResult(session.player, choiceDef.success.narrative);
      }
      if (t && stage) {
        const effectiveDiff = t.baseDifficulty + stage.difficultyBonus + (choiceDef.id === 'play-injured' ? 1 : 0);
        const adjusted = injuryAdjustedPlayer(
          session.player,
          choiceDef.id === 'reduce-role' ? 'reduce-role' : 'play-injured',
        );
        pendingMatchSim = simulateMatch(adjusted, {
          tier: t.tier,
          progressionTier: t.progressionTier,
          entryType: t.entryType,
          stageIndex: stageIdx,
          effectiveDifficulty: effectiveDiff,
          opponent: session.player.pendingMatch?.opponent,
        }, rng);
        if (session.player.forceMatchResult) {
          pendingMatchSim = applyForcedMatchResult(pendingMatchSim, session.player.forceMatchResult);
        }
        injuryMatchResolved = true;
        const resolved = buildMatchResolveResult(session.player, pendingMatchSim, t, stageIdx);
        resolved.chosenOutcome = {
          ...resolved.chosenOutcome,
          narrative: `${choiceDef.id === 'reduce-role' ? '你降低了承担，避开最吃身体的关键位。' : '你带伤上场，手腕和肩颈都在提醒你这不是正常状态。'}${resolved.chosenOutcome.narrative}`,
          progression: {
            ...(resolved.chosenOutcome.progression ?? {}),
            injuryRestRounds: Math.max(1, session.player.restRounds ?? 1),
          },
        };
        return resolved;
      }
    }

    if (tournamentMatch) {
      const t = getTournament(tournamentMatch[1]!);
      const stageIdx = parseInt(tournamentMatch[2]!, 10);
      const stage = t?.bracket[stageIdx];
      if (t && stage) {
        const effectiveDiff = t.baseDifficulty + stage.difficultyBonus;
        pendingMatchSim = simulateMatch(session.player, {
          tier: t.tier,
          progressionTier: t.progressionTier,
          entryType: t.entryType,
          stageIndex: stageIdx,
          effectiveDifficulty: effectiveDiff,
          opponent: session.player.pendingMatch?.opponent,
        }, rng);
        if (session.player.forceMatchResult) {
          pendingMatchSim = applyForcedMatchResult(pendingMatchSim, session.player.forceMatchResult);
        }
        return buildMatchResolveResult(session.player, pendingMatchSim, t, stageIdx);
      }
    }
    return resolveChoice({
        player: session.player,
        event: eventDef,
        choice: choiceDef,
        traits,
        rng,
        rollBonus: effectiveRollBonus,
      });
  })();
  const seriesContext = effectiveActiveSequence?.type === 'tournament-series'
    ? (effectiveActiveSequence.context as unknown as TournamentSeriesContext)
    : undefined;
  const willStartClubInterviewSequence = !effectiveActiveSequence &&
    eventDef.id === 'chain-club-response' &&
    outcome.success &&
    Boolean(pickClubInterviewEvent(session.player));
  const shouldAdvanceRound = effectiveActiveSequence
    ? isSequenceFinalStep(effectiveActiveSequence)
    : roundPlan
      ? roundPlanCountRemaining(roundPlan) === 0
      : queuedEvents.length === 0 && !willStartClubInterviewSequence;

  const chosenStateDelta = outcomeStateDelta(outcome.chosenOutcome);
  const chosenResourceDelta = outcomeResourceDelta(outcome.chosenOutcome);
  const chosenProgression = outcomeProgression(outcome.chosenOutcome);
  const chosenTags = outcomeTags(outcome.chosenOutcome);
  const chosenEffects = outcomeEffects(outcome.chosenOutcome);

  const stageBefore = session.player.stage;
  const wasBroke = session.player.stats.money <= 0;

  // ── 核心属性（resolver 已应用成长）──
  let statsAfterGrowth = outcome.nextStats;
  const passiveEffects: string[] = [];
  const qualificationChanges: string[] = [];
  const tagsAdded = [...outcome.tagsAdded];
  const tagsRemoved = [...outcome.tagsRemoved];

  // ── 成长上限更新 ──
  let growthSpent = (session.player.growthSpent ?? 0) + outcome.growthApplied;
  if (growthSpent > GROWTH_CAP) growthSpent = GROWTH_CAP;

  const existingBuffs = session.player.buffs ?? [];

  // ── 破产处理（money 仍在 stats 中）──
  let brokeStressBump = 0;
  if (statsAfterGrowth.money <= 0) {
    statsAfterGrowth = applyDelta(statsAfterGrowth, { mentality: -BROKE_MENTALITY_DRAIN });
    passiveEffects.push('broke-mentality-drain');
    brokeStressBump = 8;
    if (!wasBroke && !tagsAdded.includes('broke')) tagsAdded.push('broke');
  }

  // ── 压力计算 ──
  let stress = session.player.stress ?? 0;
  let fame = session.player.fame ?? 0;
  const stressBefore = stress;
  const fameBefore = fame;

  const volatile = session.player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };

  const dramaAmplify = (session.player.roster ?? []).some((tm) => tm.personality === 'drama');
  const feelDeltaRaw = dramaAmplify ? outcome.feelDelta * 1.2 : outcome.feelDelta;
  const tiltDeltaRaw = dramaAmplify ? outcome.tiltDelta * 1.2 : outcome.tiltDelta;
  const stressDeltaRaw = dramaAmplify && chosenStateDelta.stress !== 0
    ? chosenStateDelta.stress * 1.2
    : chosenStateDelta.stress;
  const fameDeltaRaw = dramaAmplify && chosenResourceDelta.fame !== 0
    ? chosenResourceDelta.fame * 1.2
    : chosenResourceDelta.fame;

  const stateContext = {
    actionTag: eventDef.type,
    source: eventDef.type === 'routine'
      ? 'routine' as const
      : eventDef.type === 'match'
        ? 'match' as const
        : 'event' as const,
  };
  const fatigueDeltaBase = dramaAmplify ? outcome.fatigueDelta * 1.2 : outcome.fatigueDelta;
  let stressDeltaBase = 0;
  let stressFromFailure = false;
  if (typeof stressDeltaRaw === 'number' && stressDeltaRaw !== 0) {
    stressDeltaBase = stressDeltaRaw;
  } else if (!outcome.success) {
    stressDeltaBase = IMPLICIT_FAILURE_STRESS;
    stressFromFailure = true;
  }

  const modifierPlayer = { ...session.player, stats: statsAfterGrowth, buffs: existingBuffs };
  const modifiedState = applyStateDeltaModifiers(
    modifierPlayer,
    { fatigueDelta: fatigueDeltaBase, stressDelta: stressDeltaBase },
    stateContext,
  );
  passiveEffects.push(...modifiedState.passiveEffects);
  const fatigueDeltaRaw = modifiedState.fatigueDelta;
  if (stressDeltaBase !== 0) {
    stress = clampStress(stress + modifiedState.stressDelta);
  }
  if (stressFromFailure) {
    passiveEffects.push('stress-from-failure');
  }
  if (fameDeltaRaw) {
    fame = clampFame(fame + fameDeltaRaw);
  }

  // 心态被动压力（基于 mentality 核心属性）
  const mentalityStress = passiveStressFromMentality(statsAfterGrowth.mentality);
  if (mentalityStress !== 0) {
    stress = clampStress(stress + mentalityStress);
    passiveEffects.push(mentalityStress > 0 ? 'stress-from-anxiety' : 'stress-decay-mentality');
  }
  if (brokeStressBump > 0) {
    const brokeState = applyStateDeltaModifiers(
      modifierPlayer,
      { fatigueDelta: 0, stressDelta: brokeStressBump },
      { actionTag: 'life', source: 'event' },
    );
    stress = clampStress(stress + brokeState.stressDelta);
    passiveEffects.push(...brokeState.passiveEffects);
    modifiedState.stressReduced = modifiedState.stressReduced || brokeState.stressReduced;
    passiveEffects.push('stress-from-broke');
  }

  let buffs: Buff[] = consumeTriggeredBuffs(existingBuffs, stateContext, {
    growthApplied: outcome.growthApplied > 0 || (
      outcome.growthKey === 'experience' &&
      Math.abs((statsAfterGrowth.experience ?? 0) - (session.player.stats.experience ?? 0)) > 0.001
    ),
    growthKey: outcome.growthKey,
    fatigueApplied: modifiedState.fatigueApplied,
    stressApplied: modifiedState.stressApplied,
    fatigueReduced: modifiedState.fatigueReduced,
    stressReduced: modifiedState.stressReduced,
  });

  if (chosenEffects.buffAdd) {
    buffs = [...buffs, chosenEffects.buffAdd];
  }

  if (eventDef.type === 'match') {
    if (effectiveActiveSequence?.type === 'tournament-series') {
      if (activeSequenceStep?.dynamicEventKind === 'tournament-map') {
        buffs = consumeMatchBuffsForScope(buffs, 'per-map');
      } else if (activeSequenceStep?.dynamicEventKind === 'tournament-series-decider') {
        buffs = consumeMatchBuffsForScope(buffs, 'series');
      }
    } else if (tournamentMatch) {
      buffs = consumeMatchBuffsForScope(buffs, 'series');
    }
  }

  // ── 状态系统更新（feel / tilt / fatigue）──
  const feelCap = session.player.feelCap ?? FEEL_CAP_DEFAULT;
  let feel = clampFeel(volatile.feel + feelDeltaRaw, feelCap);
  let tilt = clampTilt(volatile.tilt + tiltDeltaRaw);
  let fatigue = clampFatigue(volatile.fatigue + fatigueDeltaRaw);

  // Tilt 影响手感：tilt >= 2 → 手感上限降低
  if (tilt >= 2 && feel > 1) feel = clampFeel(feel - 0.5, feelCap);
  // 手感很热但疲劳极高 → 自然衰减
  if (fatigue >= 85 && feel > 0) feel = clampFeel(feel - 1, feelCap);

  // ── 大成功 / 大失败 附加效果 ──
  if (outcome.resultTier === 'critical_success') {
    feel = clampFeel(feel + 1, feelCap);
    stress = clampStress(stress - 5);
    passiveEffects.push('critical-success-bonus');
  } else if (outcome.resultTier === 'critical_failure') {
    feel = clampFeel(feel - 1, feelCap);
    stress = clampStress(stress + 10);
    passiveEffects.push('critical-failure-penalty');
  }

  const feelChange = feel - volatile.feel;
  const tiltChange = tilt - volatile.tilt;
  const fatigueChange = fatigue - volatile.fatigue;

  // ── 受伤/强制休养 ──
  let restRounds = session.player.restRounds ?? 0;
  if (chosenProgression.injuryRestRounds && chosenProgression.injuryRestRounds > 0) {
    restRounds = Math.max(restRounds, chosenProgression.injuryRestRounds);
    if (!tagsAdded.includes('injured')) tagsAdded.push('injured');
    passiveEffects.push(`强制休养：本次事件造成伤病，休养 ${chosenProgression.injuryRestRounds} 回合`);
  }
  if (statsAfterGrowth.constitution <= CONSTITUTION_COLLAPSE && restRounds <= 0) {
    restRounds = INJURY_REST_ROUNDS;
    if (!tagsAdded.includes('injured')) tagsAdded.push('injured');
    passiveEffects.push(`强制休养：体质 ${statsAfterGrowth.constitution} 已降至崩溃线 ${CONSTITUTION_COLLAPSE}，休养 ${INJURY_REST_ROUNDS} 回合`);
  }
  // ── 压力崩溃检查 ──
  let stressMaxRounds = session.player.stressMaxRounds ?? 0;
  if (stress >= STRESS_MAX) {
    stressMaxRounds += 1;
    passiveEffects.push(`stress-pegged-${Math.min(stressMaxRounds, STRESS_GRACE_ROUNDS)}`);
    if (!tagsAdded.includes('breaking-down')) tagsAdded.push('breaking-down');
  } else {
    if (stressMaxRounds > 0) passiveEffects.push('stress-eased');
    if (stressMaxRounds > 0 || session.player.tags.includes('breaking-down')) {
      tagsRemoved.push('breaking-down');
    }
    stressMaxRounds = 0;
  }

  const nextRound = session.player.round + (shouldAdvanceRound ? 1 : 0);
  let careerExperienceGrowth = 0;
  if (shouldAdvanceRound) {
    const careerGrowth = applyCareerExperienceGrowth(statsAfterGrowth, CAREER_TIME_EXPERIENCE_RAW);
    statsAfterGrowth = careerGrowth.stats;
    careerExperienceGrowth = careerGrowth.grown;
    if (careerExperienceGrowth > 0) passiveEffects.push('career-time-experience');
  }

  // ── 属性变化 delta（用于 RoundResult）──
  const statChanges: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const diff = statsAfterGrowth[k] - session.player.stats[k];
    if (Math.abs(diff) > 0.001) statChanges[k] = diff;
  }

  // 连败追踪（基于本回合赛事结果）
  let consecutiveLosses = session.player.consecutiveLosses ?? 0;
  if (eventDef.id.startsWith('tournament-') && !outcome.success) {
    consecutiveLosses += 1;
  } else if (eventDef.id.startsWith('tournament-') && outcome.success) {
    consecutiveLosses = 0;
  }

  // 破产连续轮次追踪：用于家人救济事件触发
  let consecutiveBrokeRounds = session.player.consecutiveBrokeRounds ?? 0;
  if (statsAfterGrowth.money <= 0) {
    consecutiveBrokeRounds += 1;
  } else {
    consecutiveBrokeRounds = 0;
  }

  // ── 冷却 tag 处理 ──────────────────────────────────────────────
  // 1. 先剪掉已过期的冷却 tag
  let nextTagExpiry: Record<string, number> = { ...(session.player.tagExpiry ?? {}) };
  const expiredCdTags = Object.entries(nextTagExpiry)
    .filter(([, exp]) => exp <= nextRound)
    .map(([t]) => t);
  for (const t of expiredCdTags) delete nextTagExpiry[t];

  // 2. 组装 nextTags（先去掉 tagsRemoved 和过期冷却 tag，再加 tagsAdded）
  const nextTags = dedupe([
    ...session.player.tags.filter((t) => !tagsRemoved.includes(t) && !expiredCdTags.includes(t)),
    ...tagsAdded,
  ]);

  // 3. 写入本次事件新增的冷却 tag
  const newCooldowns = chosenTags.cooldowns;
  for (const [tag, duration] of Object.entries(newCooldowns)) {
    if (!nextTags.includes(tag)) nextTags.push(tag);
    nextTagExpiry[tag] = nextRound + duration;
  }
  nextTagExpiry = refreshTagExpiry(nextTags, nextTagExpiry, nextRound, tagsAdded);

  const { year: nextYear, week: nextWeek } = shouldAdvanceRound
    ? advanceWeek(session.player.year ?? 1, session.player.week ?? 1)
    : { year: session.player.year ?? 1, week: session.player.week ?? 1 };

  if (shouldAdvanceRound && restRounds > 0) {
    restRounds -= 1;
    if (restRounds === 0) {
      if (!tagsRemoved.includes('injured')) tagsRemoved.push('injured');
      passiveEffects.push('rest-completed');
    }
  }

  const fallbackQualificationExpiry = defaultQualificationExpiry(nextYear, nextWeek);
  const normalizedPlayerQualifications = normalizeQualificationBatches(
    session.player.qualificationSlots ?? {},
    session.player.qualificationSlotBatches,
    fallbackQualificationExpiry,
  );
  const normalizedTeamQualifications = normalizeQualificationBatches(
    session.player.teamQualificationSlots ?? {},
    session.player.teamQualificationSlotBatches,
    fallbackQualificationExpiry,
  );
  const activePlayerQualifications = expireQualificationBatches(
    normalizedPlayerQualifications.batches,
    { year: nextYear, week: nextWeek },
  );
  const activeTeamQualifications = expireQualificationBatches(
    normalizedTeamQualifications.batches,
    { year: nextYear, week: nextWeek },
  );
  let nextQualificationSlots = activePlayerQualifications.slots;
  let nextTeamQualificationSlots = activeTeamQualifications.slots;
  let nextQualificationSlotBatches = activePlayerQualifications.batches;
  let nextTeamQualificationSlotBatches = activeTeamQualifications.batches;
  const expiredQualificationCount =
    activePlayerQualifications.expiredCount + activeTeamQualifications.expiredCount;
  if (expiredQualificationCount > 0) {
    qualificationChanges.push(`资格过期：失去 ${expiredQualificationCount} 张资格门票`);
  }

  // ── 行动力重置（赛事比赛周冻结为 0，面试期间减半）────────────────
  const pm = session.player.pendingMatch;
  const isMatchWeek =
    pm !== null &&
    pm !== undefined &&
    pm.resolveYear === nextYear &&
    pm.resolveWeek === nextWeek;
  const isInterviewPhase = nextTags.includes('interview-pending');
  const nextActionPoints = shouldAdvanceRound
    ? isMatchWeek ? 0 : isInterviewPhase ? 50 : 100
    : session.player.actionPoints;

  // ── 商店冷却修剪（过期 round 已过）──────────────────────────────
  const nextShopCooldowns: Record<string, number> = {};
  for (const [itemId, until] of Object.entries(session.player.shopCooldowns ?? {})) {
    if (until > nextRound) nextShopCooldowns[itemId] = until;
  }

  let nextPlayer: Player = {
    ...session.player,
    stats: statsAfterGrowth,
    volatile: { feel, tilt, fatigue },
    buffs,
    growthSpent,
    stage: outcome.stageAfter,
    team: session.player.team,
    round: nextRound,
    tags: nextTags,
    tagExpiry: nextTagExpiry,
    stress,
    fame,
    restRounds,
    stressMaxRounds,
    year: nextYear,
    week: nextWeek,
    actionPoints: nextActionPoints,
    roundCombos: shouldAdvanceRound ? [] : session.player.roundCombos,
    shopCooldowns: nextShopCooldowns,
    qualificationSlots: nextQualificationSlots,
    teamQualificationSlots: nextTeamQualificationSlots,
    qualificationSlotBatches: nextQualificationSlotBatches,
    teamQualificationSlotBatches: nextTeamQualificationSlotBatches,
    consecutiveLosses,
    consecutiveBrokeRounds,
  };
  if (shouldAdvanceRound) {
    nextPlayer = rolloverRoutineActions(nextPlayer);
  }

  if (nextPlayer.team) {
    if (typeof chosenEffects.teamTrustDelta === 'number' && chosenEffects.teamTrustDelta !== 0) {
      nextPlayer.teamTrust = clampTeamTrust((nextPlayer.teamTrust ?? 50) + chosenEffects.teamTrustDelta);
      passiveEffects.push(`队伍信任 ${chosenEffects.teamTrustDelta > 0 ? '+' : ''}${chosenEffects.teamTrustDelta}`);
    }
    if (
      nextPlayer.roster &&
      typeof chosenEffects.teamChemistryDelta === 'number' &&
      chosenEffects.teamChemistryDelta !== 0
    ) {
      nextPlayer.roster = adjustRosterChemistry(nextPlayer.roster, chosenEffects.teamChemistryDelta);
      passiveEffects.push(`全队队友默契 ${chosenEffects.teamChemistryDelta > 0 ? '+' : ''}${chosenEffects.teamChemistryDelta}`);
    }
    if (
      nextPlayer.roster &&
      chosenEffects.targetIdentity &&
      typeof chosenEffects.targetTeammateChemistryDelta === 'number' &&
      chosenEffects.targetTeammateChemistryDelta !== 0
    ) {
      const applied = applyTargetTeammateChemistryDelta(
        nextPlayer,
        chosenEffects.targetIdentity,
        chosenEffects.targetTeammateChemistryDelta,
      );
      nextPlayer = applied.player;
      if (applied.passiveEffect) passiveEffects.push(applied.passiveEffect);
    }
    if (
      nextPlayer.roster &&
      chosenEffects.opposingTargetIdentity &&
      typeof chosenEffects.opposingTargetTeammateChemistryDelta === 'number' &&
      chosenEffects.opposingTargetTeammateChemistryDelta !== 0
    ) {
      const applied = applyTargetTeammateChemistryDelta(
        nextPlayer,
        chosenEffects.opposingTargetIdentity,
        chosenEffects.opposingTargetTeammateChemistryDelta,
      );
      nextPlayer = applied.player;
      if (applied.passiveEffect) passiveEffects.push(applied.passiveEffect);
    }
  }

  if (eventDef.id.startsWith('promotion-') && outcome.success && outcome.teamTierSet) {
    const promotedClub = pickPromotionClub(outcome.teamTierSet, session.id, nextRound);
    if (promotedClub) {
      const offer = generateTeamOffer(promotedClub.id);
      nextPlayer = joinTeamFromOffer(
        session,
        { ...nextPlayer, pendingOffer: offer },
        offer,
        { contractDispute: false },
      );
      passiveEffects.push(`签约 ${offer.clubName}`);
    }
  }

  // ── 明星/老将 tag 检查与首次获得奖励 ─────────────────────────────
  // veteran tag：顶级赛事（s-main/major）累计参加 4 场即可获得
  const topParticipations =
    (nextPlayer.tierParticipations?.['s-main'] ?? 0) +
    (nextPlayer.tierParticipations?.['major'] ?? 0);
  if (topParticipations >= 4 && !nextTags.includes('veteran')) {
    nextTags.push('veteran');
    tagsAdded.push('veteran');
  }
  // 首次获得 veteran tag：+2 心态 -15 压力
  if (tagsAdded.includes('veteran') && !session.player.tags.includes('veteran')) {
    nextPlayer.stats = { ...nextPlayer.stats, mentality: nextPlayer.stats.mentality + 2 };
    nextPlayer.stress = Math.max(0, (nextPlayer.stress ?? 0) - 15);
  }

  if (tournamentMatch && session.player.forceMatchResult) {
    nextPlayer.forceMatchResult = null;
  }

  if (CLUB_INTERVIEW_IDS.has(eventDef.id)) {
    nextPlayer.pendingApplication = null;
  }

  // 家人危机事件触发：无论哪种选择都设永久 CD 防止重复触发
  if (eventDef.id === 'family-crisis-illness' && !nextPlayer.pendingFamilyCrisis) {
    nextPlayer.tagExpiry = { ...(nextPlayer.tagExpiry ?? {}), 'family-crisis-cd': Number.MAX_SAFE_INTEGER };
    if (choiceDef.id !== 'abandon-family') {
      nextPlayer.pendingFamilyCrisis = { amountNeeded: 80, deadlineRound: nextPlayer.round + 4 };
      passiveEffects.push('危机倒计时：4 回合内筹集 80K 手术费，否则职业生涯结束');
    }
  }

  if (
    eventDef.id.startsWith('bailout-team-') &&
    !choiceDef.isRefusal &&
    nextPlayer.team &&
    nextPlayer.salaryTracker &&
    !nextPlayer.salaryTracker.salaryRestoreRound
  ) {
    const originalMonthlySalary = nextPlayer.team.monthlySalary;
    nextPlayer.team = {
      ...nextPlayer.team,
      monthlySalary: Math.floor(originalMonthlySalary * 0.8),
    };
    nextPlayer.salaryTracker = {
      ...nextPlayer.salaryTracker,
      originalMonthlySalary,
      salaryRestoreRound: nextPlayer.round + 12,
    };
    passiveEffects.push('战队垫款：未来 12 周薪资临时下调 20%');
  }

  // 月薪入账：每 4 回合结算一次，入队后从 salaryTracker.lastPayRound 起算
  // 必须在 processRecoverySystems 之前结算，确保到期的家人危机检查能看到当回合薪资
  if (shouldAdvanceRound && nextPlayer.team && nextPlayer.salaryTracker) {
    if (
      nextPlayer.salaryTracker.salaryRestoreRound &&
      nextPlayer.round >= nextPlayer.salaryTracker.salaryRestoreRound
    ) {
      nextPlayer.team = {
        ...nextPlayer.team,
        monthlySalary: nextPlayer.salaryTracker.originalMonthlySalary ?? nextPlayer.team.monthlySalary,
      };
      const restoredTracker = { ...nextPlayer.salaryTracker };
      delete restoredTracker.originalMonthlySalary;
      delete restoredTracker.salaryRestoreRound;
      nextPlayer.salaryTracker = restoredTracker;
      passiveEffects.push('临时薪资下调结束，周薪恢复');
    }

    const roundsSinceLastPay = nextPlayer.round - nextPlayer.salaryTracker.lastPayRound;
    if (roundsSinceLastPay >= nextPlayer.salaryTracker.payCycle) {
      applyMoneyTransaction(nextPlayer, nextPlayer.team.monthlySalary);
      nextPlayer.salaryTracker = {
        ...nextPlayer.salaryTracker,
        lastPayRound: nextPlayer.round,
      };
      passiveEffects.push(`月薪入账 +${nextPlayer.team.monthlySalary}K`);
    }
  }

  if (
    nextPlayer.team?.teamStatus &&
    nextPlayer.team.teamStatus !== 'starter' &&
    nextPlayer.team.teamStatusUntilRound &&
    nextPlayer.round >= nextPlayer.team.teamStatusUntilRound
  ) {
    nextPlayer.team = {
      ...nextPlayer.team,
      teamStatus: 'starter',
    };
    delete nextPlayer.team.teamStatusUntilRound;
    passiveEffects.push('队伍定位更新：你已进入首发名单');
  }

  const recoveryEffects: string[] = [];
  if (shouldAdvanceRound || eventDef.id.startsWith('bailout-')) {
    processRecoverySystems(nextPlayer, eventDef.id, recoveryEffects, choiceDef, { processLivingEconomy: shouldAdvanceRound });
    passiveEffects.push(...recoveryEffects);
  }

  if (!nextPlayer.team && nextPlayer.roster) {
    nextPlayer.roster = null;
  }

  if (!nextPlayer.team) {
    nextPlayer.activeRole = null;
    nextPlayer.teamTrust = 0;
  }

  if ([
    'chain-team-joined',
    'chain-team-promotion-onboarding',
    'chain-team-transfer-onboarding',
  ].includes(eventDef.id) && outcome.success) {
    if (choiceDef.id === 'accept-role' && nextPlayer.roster) {
      const filledRoles = new Set(nextPlayer.roster.map((tm) => tm.role));
      const allRoles: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];
      const openRoles = allRoles.filter((r) => !filledRoles.has(r));
      const assigned = openRoles.length > 0
        ? openRoles[Math.floor(rng() * openRoles.length)]!
        : (nextPlayer.preferredRole ?? 'Entry');
      nextPlayer.activeRole = assigned;
      nextPlayer.activeRoleRounds = 0;
    } else if (choiceDef.id === 'stay-flexible') {
      nextPlayer.activeRole = null;
      nextPlayer.activeRoleRounds = 0;
    }
  }

  if (nextPlayer.activeRole && nextPlayer.preferredRole && nextPlayer.activeRole !== nextPlayer.preferredRole) {
    nextPlayer.roleCrystallized = false;
  }

  if (shouldAdvanceRound && nextPlayer.activeRole) {
    nextPlayer.activeRoleRounds = (nextPlayer.activeRoleRounds ?? 0) + 1;
    if (
      nextPlayer.activeRoleRounds >= 24 &&
      !nextPlayer.roleCrystallized &&
      !nextPlayer.tags.includes('role-crystallize-cd')
    ) {
      const fit = roleFitScore(nextPlayer, nextPlayer.activeRole);
      const pressure = deriveRolePressure(nextPlayer, session.history);
      if (fit >= 70 && pressure <= 30) {
        nextPlayer.preferredRole = nextPlayer.activeRole;
        nextPlayer.roleCrystallized = true;
        nextPlayer.tags = nextPlayer.tags.filter((tag) => tag !== 'role-confusion');
        delete nextPlayer.tagExpiry['role-confusion'];
        if (!nextPlayer.tags.includes('role-crystallize-cd')) nextPlayer.tags.push('role-crystallize-cd');
        nextPlayer.tagExpiry['role-crystallize-cd'] = nextPlayer.round + 24;
        passiveEffects.push('角色结晶：你已成为公认的 ' + nextPlayer.activeRole);
      } else {
        nextPlayer.activeRoleRounds = 18;
        if (!nextPlayer.tags.includes('role-crystallize-cd')) nextPlayer.tags.push('role-crystallize-cd');
        nextPlayer.tagExpiry['role-crystallize-cd'] = nextPlayer.round + 8;
        passiveEffects.push('角色结晶未完成：你还没真正站稳这个位置');
      }
    }
  }

  if (eventDef.id === 'chain-role-transition-start') {
    if (choiceDef.id === 'commit-transition' && outcome.success) {
      const allRoles: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];
      const eligible = allRoles.filter((r) => {
        if (r === nextPlayer.preferredRole) return false;
        const req = ROLE_STAT_REQUIREMENT[r];
        return req && (nextPlayer.stats[req.stat] ?? 0) >= req.min;
      });
      if (eligible.length > 0) {
        const target = eligible[Math.floor(rng() * eligible.length)]!;
        const resolveRound = nextPlayer.round + 3 + Math.floor(rng() * 3);
        nextPlayer.roleTransition = { targetRole: target, startedRound: nextPlayer.round, resolveRound };
        nextPlayer.roleCrystallized = false;
      }
    } else {
      nextPlayer.roleTransition = null;
    }
  }

  if (eventDef.id === 'chain-role-transition-resolve') {
    if (choiceDef.id === 'prove-transition' && outcome.success && nextPlayer.roleTransition) {
      const targetRole = nextPlayer.roleTransition.targetRole;
      nextPlayer.preferredRole = targetRole;
      nextPlayer.activeRole = targetRole;
      nextPlayer.activeRoleRounds = 0;
      nextPlayer.roleCrystallized = false;
      passiveEffects.push('角色转型成功：你开始正式转向 ' + targetRole);
    }
    nextPlayer.roleTransition = null;
  }

  // ── 队友转会预警：更新 pendingDeparture 状态 ─────────────────────
  if (eventDef.id === 'chain-teammate-transfer-rumor' && nextPlayer.pendingDeparture) {
    nextPlayer.pendingDeparture = { ...nextPlayer.pendingDeparture, rumorShown: true };
  }

  if (eventDef.id === 'chain-teammate-transfer-reveal' && nextPlayer.pendingDeparture) {
    nextPlayer.pendingDeparture = { ...nextPlayer.pendingDeparture, revealed: true };
    const isEarlyAction =
      (choiceDef.id === 'contact-coach' && outcome.success) ||
      (choiceDef.id === 'confront-teammate' && outcome.success);
    if (isEarlyAction) {
      nextPlayer.pendingDeparture = { ...nextPlayer.pendingDeparture, earlyRecruit: true };
    }
    // 质询成功：队友承认，信任小幅下滑
    if (choiceDef.id === 'confront-teammate' && outcome.success && nextPlayer.roster) {
      nextPlayer.teamTrust = clampTeamTrust((nextPlayer.teamTrust ?? 50) - 5);
    }
  }

  const isConflictDeparture =
    eventDef.id === 'chain-team-fired' ||
    (eventDef.id === 'chain-team-conflict' && chosenTags.add.includes('bad-blood'));
  const isTeamDeparture =
    (eventDef.id === 'chain-team-fired' && (choiceDef.id === 'accept-gracefully' || !outcome.success)) ||
    (eventDef.id === 'chain-contract-renewal' && choiceDef.id === 'leave-team') ||
    (eventDef.id === 'chain-team-conflict' && chosenTags.add.includes('bad-blood'));

  if (isTeamDeparture) {
    const settlement = settleSalaryOnDeparture(nextPlayer);
    if (settlement > 0) passiveEffects.push(`离队薪资结清 +${settlement}K`);

    // bad-blood 仅在冲突性离队时添加，合约到期正常分手不加
    if (isConflictDeparture && !tagsAdded.includes('bad-blood')) tagsAdded.push('bad-blood');

    if (nextPlayer.roster && nextPlayer.roster.length > 0 && rng() < 0.5) {
      if (!tagsAdded.includes('old-teammate-contact')) {
        tagsAdded.push('old-teammate-contact');
        passiveEffects.push('留下了一位前队友的联系方式');
      }
    }

    nextPlayer.roster = null;
    Object.assign(nextPlayer, clearTeamQualifications(nextPlayer, qualificationChanges));
  }

  // 队友后台成长
  if (shouldAdvanceRound && nextPlayer.roster) {
    const growthRng = makeRng(
      hashString(session.id) ^ (nextRound * 1299709),
    );
    nextPlayer.roster = nextPlayer.roster.map((tm) => {
      if (tm.growthSpent >= TEAMMATE_GROWTH_CAP) return tm;
      const statKeys: (keyof typeof tm.stats)[] = ['agility', 'intelligence', 'mentality', 'experience'];
      const key = statKeys[Math.floor(growthRng() * statKeys.length)]!;
      const rawGain = 0.08 + growthRng() * 0.10;
      const applied = rawGain * growthFactor(tm.stats[key]);
      const remainingCap = TEAMMATE_GROWTH_CAP - tm.growthSpent;
      if (remainingCap <= 0) return tm;
      const capped = Math.min(applied, remainingCap);
      return {
        ...tm,
        stats: { ...tm.stats, [key]: tm.stats[key] + capped },
        growthSpent: tm.growthSpent + capped,
      };
    });
    nextPlayer = refreshVisibleTeamIdentities(nextPlayer);
  }

  if (eventDef.type === 'tournament-context') {
    nextPlayer = markTournamentContextEventConsumed(nextPlayer, eventDef.id);
  }

  nextPlayer = applyInjuryRiskTick(
    nextPlayer,
    eventDef.type === 'match'
      ? 'match'
      : eventDef.type === 'rest'
        ? 'rest'
        : 'routine',
    passiveEffects,
  );

  const teamSnapshot = session.player.team
    ? {
        clubId: session.player.team.clubId,
        name: session.player.team.name,
        tag: session.player.team.tag,
        region: session.player.team.region,
        tier: session.player.team.tier,
      }
    : undefined;

  nextPlayer = applyAutomaticTagCleanup(nextPlayer, tagsRemoved);

  const result: RoundResult = {
    round: nextPlayer.round,
    eventId: eventDef.id,
    eventType: eventDef.type,
    eventTitle: eventDef.title,
    teamSnapshot,
    choiceId: choiceDef.id,
    choiceLabel: choiceDef.label,
    success: outcome.success,
    resultTier: outcome.resultTier,
    roll: outcome.roll,
    dc: outcome.dc,
    naturalRoll: outcome.naturalRoll,
    narrative: outcome.chosenOutcome.narrative,
    statChanges,
    newStats: nextPlayer.stats,
    stageBefore,
    stageAfter: outcome.stageAfter,
    tagsAdded,
    tagsRemoved,
    passiveEffects,
    qualificationChanges,
    stressChange: stress - stressBefore,
    fameChange: fame - fameBefore,
    feelChange,
    tiltChange,
    fatigueChange,
    buffsAdded: chosenEffects.buffAdd ? [chosenEffects.buffAdd] : [],
    matchStats: pendingMatchSim
      ? {
          kills: pendingMatchSim.kills,
          deaths: pendingMatchSim.deaths,
          assists: pendingMatchSim.assists,
          headshotRate: pendingMatchSim.headshotRate,
          rating: pendingMatchSim.rating,
          teamScore: pendingMatchSim.teamScore,
          enemyScore: pendingMatchSim.enemyScore,
        } satisfies MatchStats
      : undefined,
    ...(activeSequence ? sequenceResultFields(activeSequence) : {}),
    createdAt: nowIso(),
  };

  if (seriesContext && activeSequenceStep?.dynamicEventKind === 'tournament-map') {
    const mapIndex = seriesContext.maps.length;
    const mapNumber = mapIndex + 1;
    const mapName = seriesContext.mapPool[mapIndex] ?? `Map ${mapNumber}`;
    result.seriesStepKind = 'map';
    result.seriesMapIndex = mapNumber;
    result.seriesMapCount = seriesContext.mapPool.length;
    result.seriesMapName = mapName;
  } else if (seriesContext && activeSequenceStep?.dynamicEventKind === 'tournament-break') {
    const lastMap = seriesContext.maps[seriesContext.maps.length - 1];
    result.seriesStepKind = 'break';
    result.seriesMapIndex = lastMap?.mapNumber ?? seriesContext.maps.length;
    result.seriesMapCount = seriesContext.mapPool.length;
    result.seriesMapName = lastMap?.mapName;
  } else if (seriesContext && activeSequenceStep?.dynamicEventKind === 'tournament-series-decider') {
    result.seriesStepKind = 'final';
    result.seriesMapCount = seriesContext.mapPool.length;
    result.seriesMaps = seriesContext.maps.map((map) => ({
      mapNumber: map.mapNumber,
      mapName: map.mapName,
      teamScore: map.teamScore,
      enemyScore: map.enemyScore,
    }));
  }

  const ending = checkEnding(nextPlayer, outcome.endRun, outcome.endReason);

  // ── 赛事进度 ──
  let leaderboard = buildLeaderboard(session);
  let worldTournamentResult: { tournament: Tournament; playerWon: boolean; isFinalStage: boolean; opponentClubId?: string } | null = null;
  let worldStateSession: GameSession = session;
  const resolvesPendingTournament =
    nextPlayer.pendingMatch &&
    (
      eventDef.id.startsWith(`tournament-${nextPlayer.pendingMatch.tournamentId}--`) ||
      injuryMatchResolved ||
      injuryForfeit
    );
  if (resolvesPendingTournament && nextPlayer.pendingMatch) {
    const t = getTournament(nextPlayer.pendingMatch.tournamentId);
    const idx = nextPlayer.pendingMatch.stageIndex;
    const isFinal = t ? idx >= t.bracket.length - 1 : true;

    if (t) {
      worldTournamentResult = {
        tournament: t,
        playerWon: outcome.success,
        isFinalStage: isFinal,
        opponentClubId: nextPlayer.pendingMatch.opponent?.clubId,
      };
      const reward = injuryForfeit
        ? { points: 0, fame: 0 }
        : stageRewardDelta(t, idx, outcome.success);
      const extraPoints = chosenResourceDelta.points;
      const totalPoints = reward.points + extraPoints;
      if (!nextPlayer.team && totalPoints !== 0) {
        leaderboard = addPlayerPoints(leaderboard, totalPoints);
      }

      if (idx === 0) {
        const tierPart = { ...(nextPlayer.tierParticipations ?? {}) };
        tierPart[t.tier] = (tierPart[t.tier] ?? 0) + 1;
        tierPart[t.progressionTier] = (tierPart[t.progressionTier] ?? 0) + 1;
        nextPlayer.tierParticipations = tierPart;
        nextPlayer.tournamentParticipations = (nextPlayer.tournamentParticipations ?? 0) + 1;
      }
      if (outcome.success && t.qualificationMilestones?.length) {
        const matchedMilestones = t.qualificationMilestones.filter(
          (milestone) => milestone.stageIndex === idx && (milestone.requireWin ?? true),
        );
        const milestoneRewards = matchedMilestones.flatMap((milestone) => milestone.rewards);
        if (milestoneRewards.length > 0) {
          const rewardsByOwner = addQualificationRewardsByOwnerWithExpiry(
            nextPlayer.qualificationSlots ?? {},
            nextPlayer.teamQualificationSlots ?? {},
            nextPlayer.qualificationSlotBatches,
            nextPlayer.teamQualificationSlotBatches,
            milestoneRewards,
            defaultQualificationExpiry(nextPlayer.year ?? 1, nextPlayer.week ?? 1),
          );
          nextPlayer.qualificationSlots = rewardsByOwner.playerSlots;
          nextPlayer.teamQualificationSlots = rewardsByOwner.teamSlots;
          nextPlayer.qualificationSlotBatches = rewardsByOwner.playerBatches;
          nextPlayer.teamQualificationSlotBatches = rewardsByOwner.teamBatches;
          for (const milestone of matchedMilestones) {
            qualificationChanges.push(`获得资格：${milestone.label}，${formatQualificationRewards(milestone.rewards)}`);
          }
        }
      }
      if (isFinal && outcome.success) {
        const tierChamp = { ...(nextPlayer.tierChampionships ?? {}) };
        for (const key of dedupe([t.tier, t.progressionTier, ...championshipTierKeys(t)])) {
          tierChamp[key] = (tierChamp[key] ?? 0) + 1;
        }
        nextPlayer.tierChampionships = tierChamp;
        const championshipSeries = { ...(nextPlayer.championshipSeries ?? {}) };
        for (const key of championshipSeriesKeys(t)) {
          championshipSeries[key] = (championshipSeries[key] ?? 0) + 1;
        }
        nextPlayer.championshipSeries = championshipSeries;
        nextPlayer.tournamentChampionships = (nextPlayer.tournamentChampionships ?? 0) + 1;
        if (t.qualificationRewards?.length) {
          const rewardsByOwner = addQualificationRewardsByOwnerWithExpiry(
            nextPlayer.qualificationSlots ?? {},
            nextPlayer.teamQualificationSlots ?? {},
            nextPlayer.qualificationSlotBatches,
            nextPlayer.teamQualificationSlotBatches,
            t.qualificationRewards,
            defaultQualificationExpiry(nextPlayer.year ?? 1, nextPlayer.week ?? 1),
          );
          nextPlayer.qualificationSlots = rewardsByOwner.playerSlots;
          nextPlayer.teamQualificationSlots = rewardsByOwner.teamSlots;
          nextPlayer.qualificationSlotBatches = rewardsByOwner.playerBatches;
          nextPlayer.teamQualificationSlotBatches = rewardsByOwner.teamBatches;
          qualificationChanges.push(`获得资格：${formatQualificationRewards(t.qualificationRewards)}`);
        }

        // 明星选手判定：Major ≥1 / S级正赛 ≥3
        const tc = nextPlayer.tierChampionships;
        const isStar =
          (tc['major'] ?? 0) >= 1 ||
          (tc['s-main'] ?? 0) >= 3;
        if (isStar && !nextPlayer.tags.includes('star-player')) {
          nextPlayer.tags = dedupe([...nextPlayer.tags, 'star-player']);
          nextPlayer.stats = { ...nextPlayer.stats, experience: nextPlayer.stats.experience + 1 };
          nextPlayer.fame = (nextPlayer.fame ?? 0) + 10;
        }
      }
    }

    const stageLossesBefore = nextPlayer.pendingMatch.stageLosses ?? 0;
    const stageLossesAfter = outcome.success ? 0 : stageLossesBefore + 1;
    const eliminationLosses = t ? tournamentStageEliminationLosses(t, idx) : 1;
    const eliminated = !outcome.success && stageLossesAfter >= eliminationLosses;

    if (!t || eliminated || isFinal) {
      if (t) {
        nextPlayer = recordTournamentContextMatchResult(
          nextPlayer,
          result.matchStats,
          outcome.success,
          isFinal,
          isFinal && outcome.success,
        );
      }
      nextPlayer.pendingMatch = null;
    } else {
      const adv = advanceWeek(nextYear, nextWeek);
      const nextPendingMatch = {
        ...nextPlayer.pendingMatch,
        stageIndex: outcome.success ? idx + 1 : idx,
        stageLosses: outcome.success ? 0 : stageLossesAfter,
        resolveYear: adv.year,
        resolveWeek: adv.week,
        opponent: undefined,
      };
      const opponentAssigned = assignPendingMatchOpponent(
        { ...session, player: nextPlayer },
        nextPendingMatch,
      );
      worldStateSession = opponentAssigned.session;
      nextPlayer = opponentAssigned.session.player;
      nextPlayer.pendingMatch = opponentAssigned.pendingMatch;
      nextPlayer = advanceTournamentContextStage(nextPlayer, nextPlayer.pendingMatch, t);
    }

    if (!nextPlayer.promotionPending) {
      const promoCheck = checkTournamentPromotion(nextPlayer);
      if (promoCheck.canPromote && promoCheck.to) {
        const cooldownOk = (nextPlayer.promotionCooldown ?? 0) <= nextPlayer.round;
        if (cooldownOk) nextPlayer.promotionPending = promoCheck.to;
      }
    }

    // 赛事结果驱动 teamTrust 变动（人格影响速率）
    if (nextPlayer.roster) {
      const trustBase = outcome.success ? 2 : -3;
      const personalityMult = calcTrustRateMultiplier(nextPlayer.roster, rng);
      const statusMult = nextPlayer.team?.teamStatus === 'trial'
        ? 0.5
        : nextPlayer.team?.teamStatus === 'rotation'
          ? 0.75
          : 1;
      const trustDelta = Math.round(trustBase * personalityMult * statusMult);
      nextPlayer.teamTrust = clampTeamTrust(
        (nextPlayer.teamTrust ?? 50) + trustDelta,
      );
      const rawChemistryDelta = outcome.success ? 1 : (nextPlayer.teamTrust ?? 50) < 30 ? -1 : 0;
      const chemistryDelta = nextPlayer.team?.teamStatus === 'trial' ? 0 : rawChemistryDelta;
      nextPlayer.roster = adjustRosterChemistry(nextPlayer.roster, chemistryDelta);
      passiveEffects.push(
        outcome.success ? '队伍信任上升' : '队伍信任下降',
      );
      if (statusMult < 1) {
        passiveEffects.push(nextPlayer.team?.teamStatus === 'trial' ? '试训定位：队伍收益减半' : '轮换定位：队伍收益降低');
      }
      if (chemistryDelta !== 0) {
        passiveEffects.push(
          chemistryDelta > 0 ? '全队队友默契上升' : '全队队友默契下降',
        );
      }
    }
  }

  if (eventDef.id.startsWith('promotion-')) {
    if (nextPlayer.stage !== stageBefore) {
      nextPlayer.promotionPending = null;
    } else {
      nextPlayer.promotionPending = null;
      nextPlayer.promotionCooldown = nextPlayer.round + PROMOTION_DECLINE_COOLDOWN_ROUNDS;
    }
  }

  // ── 队友转会到期：执行替换 + 重新调度 ────────────────────────────
  if (shouldAdvanceRound && nextPlayer.pendingDeparture && nextPlayer.roster && nextPlayer.team) {
    nextPlayer.pendingDeparture = recalcPendingDeparture(
      { ...session, player: nextPlayer },
      nextPlayer,
      nextPlayer.pendingDeparture,
    );
    const shouldDepart =
      !nextPlayer.pendingMatch &&
      shouldTriggerPendingDeparture(nextPlayer, nextPlayer.pendingDeparture);

    if (shouldDepart) {
      const { slotId, earlyRecruit, destTeamName } = nextPlayer.pendingDeparture;
      const departingIdx = nextPlayer.roster.findIndex((tm) => tm.id === slotId);
      if (departingIdx !== -1) {
        const departingTm = nextPlayer.roster[departingIdx]!;
        const replaceRng = makeRng(hashString(session.id) ^ (nextPlayer.round * 31337));
        const newTm = generateSingleTeammate(
          nextPlayer.team.tier,
          replaceRng,
          earlyRecruit ? 'good' : 'poor',
          slotId,
        );
        const newRoster = [...nextPlayer.roster];
        newRoster[departingIdx] = newTm;
        nextPlayer.roster = newRoster;
        const trustDrop = earlyRecruit ? -10 : -20;
        nextPlayer.teamTrust = clampTeamTrust((nextPlayer.teamTrust ?? 50) + trustDrop);
        passiveEffects.push(
          `${departingTm.name} 正式转会至 ${destTeamName}，` +
          `${earlyRecruit ? '提前招募的新秀' : '临时从青训提拔的'} ${newTm.name} 补位（默契 ${trustDrop}）`,
        );
      }
      const nextRoster = nextPlayer.roster ?? [];
      if (nextRoster.length > 0) {
        const nextSlot = nextRoster[Math.floor(rng() * nextRoster.length)]!.id;
        const rivals = nextPlayer.rivals.length > 0 ? nextPlayer.rivals : [{ name: '某支战队', tag: '???', region: '' }];
        const nextDest = rivals[Math.floor(rng() * rivals.length)]!.name;
        nextPlayer.pendingDeparture = createInitialPendingDeparture(
          nextPlayer,
          rng,
          nextDest,
          nextSlot,
        );
      } else {
        nextPlayer.pendingDeparture = undefined;
      }
    }
  }

  // 离队后清除 pendingDeparture（玩家自己离队）
  if (!nextPlayer.team) {
    nextPlayer.pendingDeparture = undefined;
  }

  if (nextPlayer.forceNextEvent && nextPlayer.forceNextEvent === eventDef.id) {
    nextPlayer.forceNextEvent = null;
  }

  if (shouldAdvanceRound) {
    nextPlayer = cleanupTournamentContext(nextPlayer);
  }

  nextPlayer = applyAutomaticTagCleanup(nextPlayer, tagsRemoved);

  result.narrative = substituteRivals(result.narrative, nextPlayer.rivals);
  result.narrative = substituteTeammates(result.narrative, nextPlayer.roster ?? []);
  result.eventTitle = substituteRivals(result.eventTitle, nextPlayer.rivals);
  result.eventTitle = substituteTeammates(result.eventTitle, nextPlayer.roster ?? []);

  if (effectiveActiveSequence) {
    let sequenceForAdvance = effectiveActiveSequence;
    if (effectiveActiveSequence.type === 'tournament-series' && tournamentSeriesMapResult) {
      const context = effectiveActiveSequence.context as unknown as TournamentSeriesContext;
      const maps = [...context.maps, tournamentSeriesMapResult];
      const playerMapWins = context.playerMapWins + (tournamentSeriesMapResult.won ? 1 : 0);
      const opponentMapWins = context.opponentMapWins + (tournamentSeriesMapResult.won ? 0 : 1);
      sequenceForAdvance = {
        ...effectiveActiveSequence,
        context: {
          ...context,
          maps,
          playerMapWins,
          opponentMapWins,
        } as unknown as Record<string, unknown>,
      };
    }
    if (sequenceForAdvance.type === 'tournament-series') {
      const context = sequenceForAdvance.context as unknown as TournamentSeriesContext;
      result.seriesScore = {
        player: context.playerMapWins,
        opponent: context.opponentMapWins,
      };
      if (result.seriesStepKind === 'final') {
        result.seriesMaps = context.maps.map((map, index) => ({
          mapNumber: map.mapNumber ?? index + 1,
          mapName: map.mapName,
          teamScore: map.teamScore,
          enemyScore: map.enemyScore,
        }));
      }
    }
    const sequenceAdvance = advanceEventSequence(sequenceForAdvance, result, nextPlayer, resolveEventById);
    if (sequenceAdvance.nextStepEvent && sequenceAdvance.sequence) {
      const transferTarget = nextPlayer.pendingDeparture
        ? (nextPlayer.roster ?? []).find((tm) => tm.id === nextPlayer.pendingDeparture!.slotId)?.name
        : undefined;
      const updated: GameSession = {
        ...session,
        player: nextPlayer,
        phase: 'event',
        currentEvent: toPublicEvent(
          sequenceAdvance.nextStepEvent,
          nextPlayer.rivals,
          nextPlayer.roster ?? [],
          transferTarget,
        ),
        queuedEvents,
        activeEventSequence: sequenceAdvance.sequence,
        roundPlan: session.roundPlan,
        history: [...session.history, result],
        status: ending ? 'ended' : 'active',
        ending: ending ?? session.ending,
        updatedAt: nowIso(),
      };
      return { session: updated, result };
    }

    if (sequenceAdvance.cancelled) {
      passiveEffects.push(`事件流程取消：${sequenceAdvance.cancelReason ?? 'unknown'}`);
    }
  }

  if (eventDef.id === 'chain-club-response' && result.success) {
    const interviewEvent = pickClubInterviewEvent(nextPlayer);
    if (interviewEvent) {
      const interviewSequence = createClubInterviewSequence(nextPlayer, interviewEvent, true);
      const firstInterviewStep = interviewSequence.steps[0]?.generatedEvent ?? interviewEvent;
      const updated: GameSession = {
        ...session,
        player: nextPlayer,
        phase: 'event',
        currentEvent: toPublicEvent(firstInterviewStep, nextPlayer.rivals, nextPlayer.roster ?? []),
        queuedEvents,
        activeEventSequence: interviewSequence,
        roundPlan: session.roundPlan,
        history: [...session.history, result],
        status: ending ? 'ended' : 'active',
        ending: ending ?? session.ending,
        updatedAt: nowIso(),
      };
      return { session: updated, result };
    }
  }

  let worldSession = { ...worldStateSession, player: nextPlayer };
  if (nextPlayer.team) {
    worldSession = activateClubRuntime(worldSession, nextPlayer.team.clubId, 'player-team-active');
  }
  worldSession = tickWorldClubRuntimes(worldSession, nextPlayer.round, 'round');
  if (worldTournamentResult) {
    worldSession = recordWorldTournamentResult(
      worldSession,
      worldTournamentResult.tournament,
      worldTournamentResult.playerWon,
      worldTournamentResult.isFinalStage,
      worldTournamentResult.opponentClubId,
    );
  }
  leaderboard = buildLeaderboard(worldSession, leaderboard);

  const roundPlanContinuation = continueWithRoundPlan(
    session,
    nextPlayer,
    result,
    ending,
    worldSession,
    leaderboard,
    aiEvents,
    aiEventCache,
  );
  if (roundPlanContinuation) return roundPlanContinuation;
  if (roundPlan) {
    nextPlayer = {
      ...nextPlayer,
      lastRoundEventCount: roundPlan.servedCount,
    };
  }
  return continueWithQueuedEvents(session, nextPlayer, result, ending, worldSession, leaderboard);
}

export interface EndActionPhaseResult {
  session: GameSession;
  pickedEvent: EventDef | null;
}

export function endActionPhase(
  session: GameSession,
  aiEvents?: EventDef[],
  aiEventCache?: AiEventCacheEnvelope,
): EndActionPhaseResult {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  const sessionPhase = session.phase ?? (session.currentEvent ? 'event' : 'action');
  if (sessionPhase !== 'action') throw new Error('not in action phase');

  const workingSession = tickWorldClubRuntimes(session, session.player.round ?? 0, 'round');
  const seed = buildWeeklyEventSeed(workingSession, deriveRecentThemeGroups(workingSession.history), aiEvents, aiEventCache);
  const pickedEvent = seed.pickedEvent;
  const roundPlan = pickedEvent ? composeRoundPlan(workingSession, pickedEvent) ?? undefined : undefined;
  const presentation = prepareRoundEventPresentation(workingSession, pickedEvent);
  const currentEvent = presentation.currentEvent;
  const updated: GameSession = {
    ...workingSession,
    phase: currentEvent ? 'event' : 'action',
    currentEvent,
    queuedEvents: [],
    weeklyNews: [...(workingSession.weeklyNews ?? []), ...seed.newsItems],
    activeEventSequence: presentation.activeEventSequence,
    roundPlan,
    updatedAt: nowIso(),
  };

  return { session: updated, pickedEvent };
}
