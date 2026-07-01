import { Hono } from 'hono';
import { BACKGROUNDS, getBackground } from '../data/backgrounds.js';
import { TRAITS, getTrait } from '../data/traits.js';
import {
  ACTIONS,
  HOME_FACILITY_DEFINITIONS,
  HOUSING_CITY_PROFILES,
  HOUSING_TIERS,
  SHOP_ITEMS,
  WEEKLY_LIVING_EXPENSE,
  applyAction,
  applyChoice,
  applyClubRequest,
  applyForLoan,
  applyFriendLoan,
  applyHomeAssetAction,
  applyHomeFacilityUpgrade,
  applyHousingChange,
  applyShopPurchase,
  applyTeamMeeting,
  applyTeamPractice,
  applyLockerRoomTalk,
  applyRetainCoreTeammate,
  applyTeamTrainingFocus,
  assertNoActiveEventSequence,
  computeTraitMods,
  createSession,
  endActionPhase,
  initPlayer,
  generateTeamOffer,
  pawnItem,
  replayLastWeekRoutineActions,
  respondTeamOffer,
  rollRandomTraits,
  validateAllocation,
} from '../engine/gameEngine.js';
import { checkTournamentPromotion } from '../engine/stages.js';
import { checkEnding } from '../engine/ending.js';
import { buildSessionPayload } from '../engine/insights/index.js';
import { applyMoneyTransaction } from '../engine/money.js';
import { advanceWeek } from '../engine/calendar.js';
import { nowIso } from '../engine/utils.js';
import { canSignUpForTournament, playerTeamMeetsRequirement, resolveTournamentSignupWeek, tournamentDirectEntryBypassApplies, tournamentRequiresQualificationSlot } from '../engine/tournamentEligibility.js';
import { tournamentQualificationStageWaiverApplies } from '../engine/tournamentEligibility.js';
import { activateClubRuntime, assignPendingMatchOpponent, deriveRosterNeed, previewClubRuntime, resolveClubDisplayInfo } from '../engine/worldClubs.js';
import { createTournamentContext } from '../engine/tournamentContext.js';
import { createTournamentInstance, drawTournamentInstance, lockTournamentInstance } from '../engine/tournamentInstance.js';
import { buildRoleDebug, buildTeamIdentityDebug } from '../engine/debugPayload.js';
import { finalizeGameSessionCareerSnapshot } from '../engine/careerSnapshot.js';
import { CLUBS, clubsForStage, getClub } from '../data/clubs.js';
import { buildLeaderboard } from '../data/leaderboard.js';
import { getClubProfile } from '../data/clubProfiles.js';
import { ROLE_PROFILES } from '../data/roleProfiles.js';
import { getEventById } from '../data/events/index.js';
import {
  buildYearTournaments,
  getTournament,
  tournamentInitialStageIndex,
} from '../data/tournaments.js';
import {
  clearTeamQualifications,
  consumeQualificationSlot,
  defaultQualificationExpiry,
  expireQualificationBatches,
  qualificationFallbackSlots,
  qualificationSlotLabel,
  qualificationSlotOwner,
  refundQualificationSlot,
  normalizeQualificationBatches,
} from '../engine/qualification.js';
import { RULES_META } from '../engine/constants.js';
import { makeStorage } from '../storage/index.js';
import { toPublicEvent } from '../engine/events.js';
import { makeAiService } from '../ai/service.js';
import type { SocialFeedPost } from '../ai/prompts.js';
import {
  aiEventCacheKey,
  aiEventsFromCache,
  emptyAiEventCache,
  legacyAiEventCacheKey,
  markAiEventActive,
  mergeGeneratedAiEvents,
  parseAiEventCache,
  recordAiEventUsed,
  releaseActiveAiEvent,
  type AiEventCacheEnvelope,
} from '../ai/eventCache.js';
import type { ClubApplicationSummary, ClubRuntimeState, ClubStoryline, ClubTier, Env, EventDef, GameSession, HomeAssetActionId, HomeFacilityId, HousingTierId, MatchStats, Player, PlayerTeam, Stats } from '../types.js';

const AI_EVENT_CACHE_TTL_SECONDS = 43200;
const TEAM_ONBOARDING_EVENTS = {
  first: 'chain-team-joined',
  promotion: 'chain-team-promotion-onboarding',
  transfer: 'chain-team-transfer-onboarding',
} as const;
type TeamOnboardingKind = keyof typeof TEAM_ONBOARDING_EVENTS;
const CLUB_TIER_ORDER: Record<ClubTier, number> = {
  youth: 0,
  'semi-pro': 1,
  pro: 2,
  top: 3,
};
const TEAM_LIFECYCLE_TAGS = [
  'team-trust',
  'locker-tension',
  'suppressed-anger',
  'role-confusion',
  'caller-discipline',
  'caller-star-aligned',
  'star-freedom',
  'team-carries-through-you',
  'shared-calling',
  'star-system-ready',
  'late-round-clarity',
  'coach-neutral',
  'coach-backs-star',
  'coach-lost-control',
  'main-awper',
  'team-focus-firepower',
  'team-focus-tactics',
  'team-focus-defense',
  'team-focus-mental',
  'team-tactical-ready',
  'team-meeting-ready',
] as const;

async function saveFinalizedSession(storage: ReturnType<typeof makeStorage>, session: GameSession): Promise<void> {
  await storage.sessions.save(finalizeGameSessionCareerSnapshot(session));
}

async function endCareerSession(storage: ReturnType<typeof makeStorage>, session: GameSession): Promise<GameSession> {
  if (session.status === 'ended') return session;

  const finalized = finalizeGameSessionCareerSnapshot(session);
  const endedSession: GameSession = {
    ...finalized,
    player: {
      ...finalized.player,
      stage: 'retired',
      pendingMatch: null,
      pendingApplication: null,
      pendingOffer: null,
      tournamentContext: undefined,
      currentWeekRoutineActions: [],
      forceNextEvent: null,
      forceMatchResult: null,
    },
    phase: 'action',
    currentEvent: null,
    queuedEvents: [],
    weeklyNews: [],
    activeEventSequence: undefined,
    status: 'ended',
    ending: checkEnding(finalized.player, true, 'career_ended'),
    updatedAt: nowIso(),
  };

  await saveFinalizedSession(storage, endedSession);
  return endedSession;
}

function deriveTeamOnboardingKind(previousPlayer: Player, nextPlayer: Player): TeamOnboardingKind {
  if (!previousPlayer.everHadTeam && !previousPlayer.team) return 'first';
  const previousTier = previousPlayer.team?.tier;
  const nextTier = nextPlayer.team?.tier;
  if (
    previousTier &&
    nextTier &&
    CLUB_TIER_ORDER[nextTier] > CLUB_TIER_ORDER[previousTier]
  ) {
    return 'promotion';
  }
  return 'transfer';
}

function startTeamOnboardingSequence(session: GameSession, kind: TeamOnboardingKind): GameSession {
  const eventId = TEAM_ONBOARDING_EVENTS[kind];
  const event = getEventById(eventId);
  if (!event) return session;
  return {
    ...session,
    phase: 'event',
    currentEvent: toPublicEvent(event, session.player.rivals, session.player.roster ?? []),
    activeEventSequence: {
      id: `team-onboarding-${session.player.round}`,
      type: 'team-onboarding',
      currentIndex: 0,
      startedRound: session.player.round,
      mustCompleteInCurrentRound: true,
      status: 'active',
      context: { onboardingKind: kind },
      steps: [
        {
          id: 'team-joined',
          eventId,
          completeSequenceAfter: true,
        },
      ],
    },
  };
}

async function loadAiEventCache(
  kv: KVNamespace,
  sessionId: string,
  session: GameSession,
): Promise<AiEventCacheEnvelope> {
  const key = aiEventCacheKey(sessionId);
  const cached = await kv.get(key);
  if (cached) {
    const parsed = parseAiEventCache(cached, session.player, session.history);
    if (parsed.migrated) {
      await kv.put(key, JSON.stringify(parsed.cache), { expirationTtl: AI_EVENT_CACHE_TTL_SECONDS });
    }
    return parsed.cache;
  }

  const legacy = await kv.get(legacyAiEventCacheKey(sessionId));
  const parsed = parseAiEventCache(legacy, session.player, session.history);
  if (legacy && parsed.migrated) {
    await kv.put(key, JSON.stringify(parsed.cache), { expirationTtl: AI_EVENT_CACHE_TTL_SECONDS });
  }
  return parsed.cache;
}

async function saveAiEventCache(
  kv: KVNamespace,
  sessionId: string,
  cache: AiEventCacheEnvelope,
): Promise<void> {
  await kv.put(aiEventCacheKey(sessionId), JSON.stringify(cache), { expirationTtl: AI_EVENT_CACHE_TTL_SECONDS });
}

function refreshQualificationExpiry(player: Player): Player {
  const fallbackExpiry = defaultQualificationExpiry(player.year ?? 1, player.week ?? 1);
  const normalizedPlayer = normalizeQualificationBatches(
    player.qualificationSlots ?? {},
    player.qualificationSlotBatches,
    fallbackExpiry,
  );
  const normalizedTeam = normalizeQualificationBatches(
    player.teamQualificationSlots ?? {},
    player.teamQualificationSlotBatches,
    fallbackExpiry,
  );
  const activePlayer = expireQualificationBatches(
    normalizedPlayer.batches,
    { year: player.year ?? 1, week: player.week ?? 1 },
  );
  const activeTeam = expireQualificationBatches(
    normalizedTeam.batches,
    { year: player.year ?? 1, week: player.week ?? 1 },
  );
  return {
    ...player,
    qualificationSlots: activePlayer.slots,
    teamQualificationSlots: activeTeam.slots,
    qualificationSlotBatches: activePlayer.batches,
    teamQualificationSlotBatches: activeTeam.batches,
  };
}

function runtimeHint(runtime: ClubRuntimeState, needs: string[]): string {
  const hints: string[] = [];
  if (runtime.currentForm >= 25) hints.push('近期状态火热');
  if (runtime.currentForm <= -25) hints.push('近期状态低迷');
  if (runtime.rosterStability <= 40) hints.push('阵容不稳');
  if (runtime.internalChemistry <= 40) hints.push('磨合吃紧');
  if (needs.length > 0) hints.push(`正在寻找${needs.slice(0, 2).join(' / ')}`);
  return hints.join(' · ') || '运行稳定';
}

function buildClubApplicationSummaries(session: GameSession): ClubApplicationSummary[] {
  return CLUBS.map((club) => {
    const runtime = previewClubRuntime(session, club.id);
    const need = deriveRosterNeed(runtime);
    const profile = getClubProfile(club.id, club.tier);
    const needs = [
      ...need.neededRoles.map((role) => `${role} 位`),
      ...need.neededIdentities.map((identity) => `${identity} 身份`),
    ];
    return {
      ...club,
      runtimeSummary: {
        rosterStyle: profile.rosterStyle,
        currentForm: runtime.currentForm,
        rosterStability: runtime.rosterStability,
        internalChemistry: runtime.internalChemistry,
        clubTrust: runtime.clubTrust,
        needs,
        storylines: runtime.activeStorylines,
        hint: runtimeHint(runtime, needs),
      },
    };
  });
}


const app = new Hono<{ Bindings: Env }>();

// 校验请求头携带的 apiToken 是否与 session 匹配
function validateApiToken(authHeader: string | undefined, sessionToken: string): boolean {
  if (!authHeader) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token === sessionToken;
}

function getExecutionCtx(c: unknown): ExecutionContext | undefined {
  try {
    return (c as { executionCtx: ExecutionContext }).executionCtx;
  } catch {
    return undefined;
  }
}

function getSessionPhase(session: GameSession): 'action' | 'event' {
  return session.phase ?? (session.currentEvent ? 'event' : 'action');
}

function requireSessionPhase(session: GameSession, expected: 'action' | 'event'): void {
  const phase = getSessionPhase(session);
  if (phase !== expected) {
    throw new Error(expected === 'action' ? '当前不在行动阶段' : '当前不在事件阶段');
  }
}

// 所有 session 状态变更路由统一鉴权中间件
// 排除 /start（session 刚创建，还没有 token）和 GET 请求（只读）
app.use('/game/:sessionId/*', async (c, next) => {
  if (c.req.method === 'GET') return next();
  const path = new URL(c.req.url).pathname;
  if (
    path.endsWith('/game/roll-traits') ||
    path.endsWith('/game/start') ||
    path.endsWith('/intro')
  ) {
    return next();
  }

  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  let session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }
  return next();
});

app.get('/health', (c) => {
  const ai = makeAiService(c.env);
  return c.json({
    ok: true,
    ts: new Date().toISOString(),
    ai: { provider: c.env.AI_PROVIDER ?? 'none', active: ai.active },
  });
});

app.get('/traits', (c) => c.json({ traits: TRAITS }));
app.get('/backgrounds', (c) => c.json({ backgrounds: BACKGROUNDS }));

app.post('/game/roll-traits', (c) => {
  return c.json({ traits: rollRandomTraits(3) });
});

app.post('/game/start', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, traitIds, backgroundId, originRegion, stats } = body ?? {};
  let normalizedStats: Stats | undefined;

  if (!Array.isArray(traitIds) || traitIds.length !== 3) {
    return c.json({ error: '必须选择 3 个特质' }, 400);
  }
  // backgroundId is optional now; engine falls back to DEFAULT_BACKGROUND_ID.
  if (stats !== undefined) {
    if (typeof stats !== 'object' || stats === null) {
      return c.json({ error: 'stats 必须是对象' }, 400);
    }
    const traits = (traitIds as string[])
      .map(getTrait)
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    if (traits.length !== 3) {
      return c.json({ error: '特质无效或重复' }, 400);
    }
    const { floor } = computeTraitMods(traits);
    normalizedStats = {
      ...(stats as Stats),
      experience: floor.experience,
    };
    const err = validateAllocation(normalizedStats, floor);
    if (err) return c.json({ error: err }, 400);
  }

  try {
    const player = initPlayer({
      name: typeof name === 'string' ? name : '',
      traitIds,
      backgroundId,
      originRegion: typeof originRegion === 'string' ? originRegion : undefined,
      stats: normalizedStats,
    });
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const session = createSession(player, seed);

    const storage = makeStorage(c.env);
    await saveFinalizedSession(storage, session);

    return c.json(buildSessionPayload(session, {
      sessionId: session.id,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.get('/game/:sessionId', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  let session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  return c.json(buildSessionPayload(session, {
    phase: getSessionPhase(session),
    debugTeamIdentity: buildTeamIdentityDebug(session.player),
    debugRole: buildRoleDebug(session.player, session.history),
  }));
});

const CUSTOM_QUALITY_BONUS: Record<string, number> = {
  poor: -8,
  ok: 0,
  good: 6,
  excellent: 12,
};

app.post('/game/:sessionId/choice', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { choiceId: rawChoiceId, customAction } = body ?? {};

  const customActionTrimmed = typeof customAction === 'string' ? customAction.trim() : '';
  const hasCustomAction = customActionTrimmed.length > 0;

  if (hasCustomAction && customActionTrimmed.length > 50) {
    return c.json({ error: '自定义行动不能超过 50 个字' }, 400);
  }

  // customAction 路径：choiceId 可省略（自动取第一个选项）
  if (!hasCustomAction && (typeof rawChoiceId !== 'string' || !rawChoiceId)) {
    return c.json({ error: 'choiceId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  let session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }
  if (getSessionPhase(session) !== 'event') {
    return c.json({ error: '当前不在事件阶段' }, 400);
  }

  const ai = makeAiService(c.env, getExecutionCtx(c));

  // 自定义行动：用 LLM 评判，映射为 rollBonus，使用第一个选项作为底牌
  let choiceId = rawChoiceId as string;
  let customRollBonus = 0;
  let customNarrativePrefix: string | null = null;

  if (hasCustomAction) {
    if (!session.currentEvent || session.currentEvent.choices.length === 0) {
      return c.json({ error: 'no current event' }, 400);
    }
    if (!ai.active) {
      return c.json({ error: 'LLM 未启用，无法使用自由行动' }, 400);
    }
    // 默认用第一个选项作底牌
    choiceId = rawChoiceId && typeof rawChoiceId === 'string'
      ? rawChoiceId
      : session.currentEvent.choices[0]!.id;

    const judgment = await ai.judgeCustomAction(customActionTrimmed, session.currentEvent, session.player);
    if (judgment) {
      // 二次验证：检查判定质量与叙事方向是否合理
      const validation = await ai.validateJudgment(customActionTrimmed, session.currentEvent, judgment);
      if (validation.valid) {
        customRollBonus = CUSTOM_QUALITY_BONUS[judgment.quality as keyof typeof CUSTOM_QUALITY_BONUS] ?? 0;
        customNarrativePrefix = judgment.narrative;
      }
      // 验证不通过时：静默降级为 ok / 无叙事前缀，正常走第一个选项结算
    }
  }

  try {
    let aiEventCache: AiEventCacheEnvelope | undefined;
    let aiEvents: EventDef[] | undefined;
    try {
      aiEventCache = await loadAiEventCache(c.env.KV, id, session);
      if (session.currentEvent?.id.startsWith('ai-')) {
        aiEventCache = recordAiEventUsed(aiEventCache, session.currentEvent.id, session.player.round);
      }
      aiEventCache = releaseActiveAiEvent(aiEventCache, session.player);
      aiEvents = aiEventsFromCache(aiEventCache);
    } catch (err) {
      console.warn('[AI events] cache load failed in /choice:', err);
    }

    // 面试 post-handler 需要 clubId，但 applyChoice 内部会清空 pendingApplication
    // 提前保存，供下方生成入队邀请时使用
    const preChoicePendingApplication = session.player.pendingApplication;
    const { session: updated, result } = applyChoice(session, choiceId, customRollBonus, aiEvents, aiEventCache);

    // 自由行动时：用自定义行动作为叙事重写依据，不拼接默认叙事
    if (customNarrativePrefix) {
      result.choiceLabel = customActionTrimmed.slice(0, 30);
    }

    // 战后处理：面试成功 → 生成入队邀请
    const INTERVIEW_EVENT_IDS = new Set([
      'chain-club-interview',
      'chain-club-interview-open-match',
      'chain-club-interview-talent',
    ]);
    if (INTERVIEW_EVENT_IDS.has(result.eventId) && result.success) {
      const app = preChoicePendingApplication;
      if (app) {
        updated.player.pendingOffer = generateTeamOffer(app.clubId);
        updated.player.pendingApplication = null;
      }
    }
    // 响应失败 → 清理申请并触发被拒叙事
    if (result.eventId === 'chain-club-response' && !result.success) {
      if (!updated.player.tags.includes('club-rejected-notify')) {
        updated.player.tags = [...updated.player.tags, 'club-rejected-notify'];
      }
      updated.player.pendingApplication = null;
    }
    // 合同到期选择不续 → 清空 team
    if (result.eventId === 'chain-contract-renewal' && result.choiceId === 'leave-team') {
      updated.player = clearTeamQualifications(updated.player, result.qualificationChanges);
      updated.player.team = null;
      updated.player.consecutiveLosses = 0;
    }
    // 续约/谈判成功 → 累加续约次数
    if (result.eventId === 'chain-contract-renewal' && result.success &&
        (result.choiceId === 'renew-stay' || result.choiceId === 'negotiate-raise')) {
      updated.player.contractRenewals = (updated.player.contractRenewals ?? 0) + 1;
    }
    // 被踢出战队 → 清空 team
    if (result.eventId === 'chain-team-fired') {
      const fired = result.choiceId === 'accept-gracefully' || !result.success;
      if (fired) {
        updated.player = clearTeamQualifications(updated.player, result.qualificationChanges);
        updated.player.team = null;
        updated.player.consecutiveLosses = 0;
      }
    }
    // 对手挖角接受 → 生成更高档 rival club 的入队邀请
    if (result.eventId === 'chain-rival-poach' && result.success && result.choiceId === 'hear-offer') {
      const tierOrder: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
      const currentTierIdx = updated.player.team
        ? tierOrder.indexOf(updated.player.team.tier)
        : -1;
      const rivalClub = CLUBS.find(
        (c) => c.isRival && tierOrder.indexOf(c.tier) > currentTierIdx,
      );
      if (rivalClub) {
        const offer = generateTeamOffer(rivalClub.id);
        const rival = typeof rivalClub.rivalIndex === 'number'
          ? updated.player.rivals[rivalClub.rivalIndex]
          : undefined;
        if (rival) {
          offer.clubName = rival.name;
          offer.tag = rival.tag;
          offer.region = rival.region;
        }
        updated.player.pendingOffer = offer;
      }
    }

    const lastIdxAfter = updated.history.length - 1;
    if (lastIdxAfter >= 0) {
      updated.history[lastIdxAfter] = {
        ...updated.history[lastIdxAfter]!,
        qualificationChanges: result.qualificationChanges,
      };
    }

    await storage.sessions.appendRound(
      updated.id,
      result.round,
      result.eventId,
      result.eventType,
      result.choiceId,
      result.success,
      result,
      result.createdAt,
    );

    await saveFinalizedSession(storage, updated);

    let nextAiEventCache: AiEventCacheEnvelope | undefined;
    if (aiEventCache) {
      nextAiEventCache = releaseActiveAiEvent(aiEventCache, updated.player);
      try {
        await saveAiEventCache(c.env.KV, id, nextAiEventCache);
      } catch (err) {
        console.warn('[AI events] cache update failed:', err);
      }
    }

    if (ai.active && updated.status === 'active') {
      const refreshAiEvents = async () => {
        // Re-read the latest cache from KV instead of using the stale closure value.
        // This prevents the background refresh from overwriting concurrent writes
        // made by other requests (e.g. /action, /end-action-phase, or a second /choice).
        const baseCache: AiEventCacheEnvelope = await loadAiEventCache(c.env.KV, id, updated).catch((err) => {
          console.warn('[AI events] background reload failed, falling back to closure cache:', err);
          return nextAiEventCache ?? aiEventCache ?? emptyAiEventCache();
        });
        const preservePendingAiEvent = async () => saveAiEventCache(c.env.KV, id, baseCache);
        const writeMergedAiEvents = async (generated: EventDef[]) => {
          // Re-read again right before writing to minimize the race window.
          const freshCache = await loadAiEventCache(c.env.KV, id, updated).catch(() => baseCache);
          await saveAiEventCache(
            c.env.KV,
            id,
            mergeGeneratedAiEvents(freshCache, generated, updated.player, updated.history),
          );
        };

        try {
          const generated = await ai.generateEvents(
            updated.player,
            updated.history,
            buildWorldStorylineContext(updated),
          );
          if (generated && generated.length > 0) {
            await writeMergedAiEvents(generated);
          } else {
            await preservePendingAiEvent();
          }
        } catch (err) {
          console.warn('[AI events] refresh failed:', err);
          try {
            await preservePendingAiEvent();
          } catch (preserveErr) {
            console.warn('[AI events] preserve pending event failed:', preserveErr);
          }
        }
      };

      if (c.executionCtx) {
        c.executionCtx.waitUntil(refreshAiEvents());
      } else {
        await refreshAiEvents();
      }
    }

    return c.json(buildSessionPayload(updated, {
      result,
      phase: updated.phase,
      activeEventSequence: updated.activeEventSequence,
      promotion: checkTournamentPromotion(updated.player),
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.get('/game/meta/rules', (c) => c.json(RULES_META));

// Tournaments whose signup window is open this week for the player's stage.
app.get('/game/:sessionId/tournaments', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  let session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  try {
    assertNoActiveEventSequence(session);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '当前事件流程未结束，不能报名赛事' }, 400);
  }
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }
  session.player = refreshQualificationExpiry(session.player);
  const playerPoints =
    session.leaderboard?.find((t) => t.isPlayer)?.points ?? 0;
  const open = buildYearTournaments(session.player.year ?? 1)
    .filter((tournament) => canSignUpForTournament(
      session.player,
      tournament,
      playerPoints,
      session.player.week ?? 1,
    ));
  return c.json({
    open,
    pendingMatch: session.player.pendingMatch ?? null,
  });
});

app.get('/game/:sessionId/tournaments/all', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  const currentYear = session.player.year ?? 1;
  const currentWeek = session.player.week ?? 1;
  const snapshots = session.worldClubs?.tournamentSnapshots ?? [];

  const tournaments = buildYearTournaments(currentYear).map((tournament) => {
    const snapshot = snapshots.find((item) =>
      item.tournamentId === tournament.id &&
      item.resultYear === currentYear &&
      item.resultWeek < currentWeek,
    );
    return {
      ...tournament,
      isEnded: Boolean(snapshot),
      resultYear: snapshot?.resultYear ?? null,
      resultWeek: snapshot?.resultWeek ?? null,
      championName: snapshot ? displayClubName(session, snapshot.championClubId) : null,
      runnerUpName: snapshot ? displayClubName(session, snapshot.runnerUpClubId) : null,
    };
  });

  return c.json({
    year: currentYear,
    week: currentWeek,
    playerStage: session.player.stage,
    pendingMatch: session.player.pendingMatch ?? null,
    tournaments,
  });
});

// Sign up for a tournament — schedules its first stage 2 weeks out (prep event in week+1, match in week+2).
app.post('/game/:sessionId/signup', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { tournamentId } = body ?? {};
  if (typeof tournamentId !== 'string' || !tournamentId) {
    return c.json({ error: 'tournamentId 必填' }, 400);
  }
  const storage = makeStorage(c.env);
  let session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  const activeSession = session;
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }
  activeSession.player = refreshQualificationExpiry(activeSession.player);
  const player = activeSession.player;

  const t = getTournament(tournamentId);
  if (!t) return c.json({ error: '未知赛事' }, 400);
  const playerPoints = activeSession.leaderboard?.find((t) => t.isPlayer)?.points ?? 0;
  const stageWaived = tournamentQualificationStageWaiverApplies(player, t, playerPoints);
  if (!t.stages.includes(player.stage) && !stageWaived) {
    return c.json({ error: '当前阶段不符合参赛资格' }, 400);
  }
  if (
    t.fameRequired !== undefined &&
    (player.fame ?? 0) < t.fameRequired
  ) {
    return c.json(
      { error: `名气不足，需要 ≥ ${t.fameRequired}（当前 ${player.fame}）` },
      400,
    );
  }
  if (t.pointsRequired !== undefined && playerPoints < t.pointsRequired) {
    return c.json(
      { error: `战队 VRS 不足，需要 ≥ ${t.pointsRequired}（当前 ${playerPoints}）` },
      400,
    );
  }
  // 战队门槛校验：持有该赛事所需资格门票时可破格参加（只要有战队即可）
  const teamReq = t.teamRequirement ?? null;
  const requiresQualificationSlot = tournamentRequiresQualificationSlot(player, t, playerPoints);
  if (teamReq !== null && !playerTeamMeetsRequirement(player.team, teamReq)) {
    if (!player.team) {
      return c.json({ error: `该赛事需要签约战队才能参加` }, 400);
    }
    if (!tournamentDirectEntryBypassApplies(player.team, t, playerPoints)) {
      const hasQualTicket = !!t.qualificationTargets?.length &&
        t.qualificationTargets
          .flatMap((slot) => qualificationFallbackSlots(slot))
          .some((slot) => {
            const owner = qualificationSlotOwner(slot);
            const pool = owner === 'team'
              ? (player.teamQualificationSlots ?? {})
              : (player.qualificationSlots ?? {});
            return (pool[slot] ?? 0) > 0;
          });
      if (!hasQualTicket) {
      const tierLabels: Record<ClubTier, string> = {
        youth: '青训',
        'semi-pro': '二线',
        pro: '职业',
        top: '豪门',
      };
      return c.json(
        { error: `该赛事需要 ${tierLabels[teamReq]} 及以上战队（当前 ${tierLabels[player.team.tier]}），或持有资格门票破格参加` },
        400,
      );
      }
    }
  }
  if (player.pendingMatch) {
    return c.json({ error: '已经报名了一项赛事，先打完再说' }, 400);
  }
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const targetSignupWeek = resolveTournamentSignupWeek(player, t, playerPoints, currentWeek);
  if (targetSignupWeek === null) {
    return c.json({ error: '该赛事不在未来 12 周预报名窗口内' }, 400);
  }
  if (!canSignUpForTournament(player, t, playerPoints, targetSignupWeek)) {
    return c.json({ error: '当前资格不足，不能报名该赛事' }, 400);
  }
  const tournamentYearMatch = /^y(\d+)-/.exec(t.id);
  const tournamentYear = tournamentYearMatch ? Number(tournamentYearMatch[1]) : currentYear;
  let resolveYear = tournamentYear;
  let resolveWeek = targetSignupWeek;
  ({ year: resolveYear, week: resolveWeek } = advanceWeek(resolveYear, resolveWeek));
  ({ year: resolveYear, week: resolveWeek } = advanceWeek(resolveYear, resolveWeek));
  let usedQualificationSlot: string | undefined;
  let usedQualificationSlotOwner: 'player' | 'team' | undefined;
  let usedQualificationSlotExpiresAt: { year: number; week: number } | undefined;
  const qualificationTargets = t.qualificationTargets ?? [];
  if (requiresQualificationSlot) {
    const hasBlockedTeamTicket = qualificationTargets
      .flatMap((slot) => qualificationFallbackSlots(slot))
      .some((slot) => {
        if (qualificationSlotOwner(slot) !== 'team') return false;
        return ((player.teamQualificationSlots ?? {})[slot] ?? 0) > 0;
      }) && player.team?.teamStatus !== 'starter';
    if (hasBlockedTeamTicket) {
      return c.json({ error: '当前队内定位不是首发，不能使用战队资格门票报名' }, 400);
    }
    const usedSlot = qualificationTargets
      .flatMap((slot) => qualificationFallbackSlots(slot))
      .find((slot) => {
        const owner = qualificationSlotOwner(slot);
        const pool = owner === 'team'
          ? (player.teamQualificationSlots ?? {})
          : (player.qualificationSlots ?? {});
        return (pool[slot] ?? 0) > 0;
      });
    if (!usedSlot) {
      return c.json({ error: '缺少对应资格门票' }, 400);
    }
    usedQualificationSlot = usedSlot;
    usedQualificationSlotOwner = qualificationSlotOwner(usedSlot);
    const fallbackExpiry = defaultQualificationExpiry(session.player.year ?? 1, session.player.week ?? 1);
    if (usedQualificationSlotOwner === 'team') {
      const consumed = consumeQualificationSlot(
        session.player.teamQualificationSlots ?? {},
        session.player.teamQualificationSlotBatches,
        usedSlot,
        fallbackExpiry,
      );
      session.player.teamQualificationSlots = consumed.slots;
      session.player.teamQualificationSlotBatches = consumed.batches;
      usedQualificationSlotExpiresAt = consumed.consumedExpiry;
    } else {
      const consumed = consumeQualificationSlot(
        session.player.qualificationSlots ?? {},
        session.player.qualificationSlotBatches,
        usedSlot,
        fallbackExpiry,
      );
      session.player.qualificationSlots = consumed.slots;
      session.player.qualificationSlotBatches = consumed.batches;
      usedQualificationSlotExpiresAt = consumed.consumedExpiry;
    }
  }

  const initialStageIndex = tournamentInitialStageIndex(t, session.player.team?.tier ?? null);
  const activeTournamentInstance = drawTournamentInstance(lockTournamentInstance(createTournamentInstance(session, t)));
  session.activeTournamentInstance = activeTournamentInstance;
  const pendingMatch = {
    tournamentId: t.id,
    tier: t.tier,
    name: t.name,
    displayName: t.displayName,
    progressionTier: t.progressionTier,
    entryType: t.entryType,
    qualificationSlotUsed: usedQualificationSlot,
    qualificationSlotOwner: usedQualificationSlotOwner,
    qualificationSlotExpiresAt: usedQualificationSlotExpiresAt,
    resolveYear,
    resolveWeek,
    stageIndex: initialStageIndex,
    stageLosses: 0,
    tournamentInstanceId: activeTournamentInstance.id,
  };
  const opponentAssigned = assignPendingMatchOpponent(session, pendingMatch);
  session = opponentAssigned.session;
  session.player.pendingMatch = opponentAssigned.pendingMatch;
  session.player.tournamentContext = createTournamentContext(session.player, session.player.pendingMatch, t);
  session.updatedAt = new Date().toISOString();
  await saveFinalizedSession(storage, session);

  return c.json({
    pendingMatch: session.player.pendingMatch,
    activeTournamentInstance: session.activeTournamentInstance,
    player: session.player,
  });
});

app.post('/game/:sessionId/withdraw', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  try {
    assertNoActiveEventSequence(session);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '当前事件流程未结束，不能退赛' }, 400);
  }
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }
  session.player = refreshQualificationExpiry(session.player);
  if (!session.player.pendingMatch) return c.json({ error: '当前没有报名中的赛事' }, 400);

  const penalties: string[] = [];

  if (session.player.pendingMatch.qualificationSlotUsed) {
    const slot = session.player.pendingMatch.qualificationSlotUsed;
    const tm = getTournament(session.player.pendingMatch.tournamentId);
    // Only refund if the tournament's qualificationTargets still covers this slot,
    // guarding against stale pendingMatch data from a tournament definition change.
    const slotIsValid = tm?.qualificationTargets?.some((target) =>
      qualificationFallbackSlots(target).includes(slot),
    ) ?? false;
    if (slotIsValid) {
      const expiresAt = session.player.pendingMatch.qualificationSlotExpiresAt ??
        defaultQualificationExpiry(session.player.year ?? 1, session.player.week ?? 1);
      if (session.player.pendingMatch.qualificationSlotOwner === 'team') {
        const refunded = refundQualificationSlot(
          session.player.teamQualificationSlots ?? {},
          session.player.teamQualificationSlotBatches,
          slot,
          expiresAt,
        );
        session.player.teamQualificationSlots = refunded.slots;
        session.player.teamQualificationSlotBatches = refunded.batches;
      } else {
        const refunded = refundQualificationSlot(
          session.player.qualificationSlots ?? {},
          session.player.qualificationSlotBatches,
          slot,
          expiresAt,
        );
        session.player.qualificationSlots = refunded.slots;
        session.player.qualificationSlotBatches = refunded.batches;
      }
      penalties.push(`退还资格：${qualificationSlotLabel(slot)}`);
    }
  }

  // 弃赛惩罚
  session.player.stress = Math.min(100, (session.player.stress ?? 0) + 25);
  penalties.push('压力 +25');

  session.player.fame = Math.max(0, (session.player.fame ?? 0) - 10);
  penalties.push('名气 -10');

  // 30K 罚款（3 money points）—— 仅在二线及以上有合约的阶段
  const stageHasContract = ['second', 'pro'].includes(session.player.stage);
  if (stageHasContract) {
    applyMoneyTransaction(session.player, -3);
    penalties.push('资金 -30K');
  }

  if (!session.player.tags.includes('forfeit-recent')) {
    session.player.tags = [...session.player.tags, 'forfeit-recent'];
  }

  session.player.pendingMatch = null;
  session.player.tournamentContext = undefined;
  session.activeTournamentInstance = null;
  session.updatedAt = new Date().toISOString();
  await saveFinalizedSession(storage, session);
  return c.json({ player: session.player, activeTournamentInstance: session.activeTournamentInstance, penalties });
});

// 日常行动端点
app.post('/game/:sessionId/action', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { actionId } = body ?? {};
  if (typeof actionId !== 'string' || !actionId) {
    return c.json({ error: 'actionId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  try {
    assertNoActiveEventSequence(session);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '当前事件流程未结束，不能执行日常行动' }, 400);
  }
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    let aiEventCache: AiEventCacheEnvelope | undefined;
    try {
      aiEventCache = await loadAiEventCache(c.env.KV, id, session);
      aiEventCache = releaseActiveAiEvent(aiEventCache, session.player);
    } catch (err) {
      console.warn('[AI events] cache load failed in /action:', err);
    }

    const { actionResult, player } = applyAction(session, actionId, undefined, aiEventCache);
    session.player = player;
    session.phase = 'action';
    session.currentEvent = null;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);

    if (aiEventCache) {
      try {
        await saveAiEventCache(c.env.KV, id, aiEventCache);
      } catch (err) {
        console.warn('[AI events] action cache update failed:', err);
      }
    }

    return c.json(buildSessionPayload(session, {
      actionResult,
      player,
      phase: session.phase,
      currentEvent: null,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/replay-last-week-actions', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  try {
    assertNoActiveEventSequence(session);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '当前事件流程未结束，不能重复上周行动' }, 400);
  }
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    let aiEventCache: AiEventCacheEnvelope | undefined;
    try {
      aiEventCache = await loadAiEventCache(c.env.KV, id, session);
      aiEventCache = releaseActiveAiEvent(aiEventCache, session.player);
    } catch (err) {
      console.warn('[AI events] cache load failed in /replay-last-week-actions:', err);
    }

    const replay = replayLastWeekRoutineActions(session, aiEventCache);
    session.player = replay.player;
    session.phase = 'action';
    session.currentEvent = null;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);

    if (aiEventCache) {
      try {
        await saveAiEventCache(c.env.KV, id, aiEventCache);
      } catch (err) {
        console.warn('[AI events] replay cache update failed:', err);
      }
    }

    return c.json(buildSessionPayload(session, {
      player: session.player,
      phase: session.phase,
      currentEvent: null,
      replayResults: replay.actionResults,
      replayTeamResults: replay.teamActionResults,
      replayStopped: replay.stopped ?? null,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/end-action-phase', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  try {
    assertNoActiveEventSequence(session);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '当前事件流程未结束，不能离队' }, 400);
  }
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    let aiEventCache: AiEventCacheEnvelope | undefined;
    let aiEvents: EventDef[] | undefined;
    try {
      aiEventCache = await loadAiEventCache(c.env.KV, id, session);
      aiEventCache = releaseActiveAiEvent(aiEventCache, session.player);
      aiEvents = aiEventsFromCache(aiEventCache);
    } catch (err) {
      console.warn('[AI events] cache load failed in /end-action-phase:', err);
    }

    const { session: updated, pickedEvent } = endActionPhase(session, aiEvents, aiEventCache);
    await saveFinalizedSession(storage, updated);

    if (aiEventCache) {
      try {
        await saveAiEventCache(c.env.KV, id, markAiEventActive(aiEventCache, pickedEvent));
      } catch (err) {
        console.warn('[AI events] end-action cache update failed:', err);
      }
    }

    return c.json(buildSessionPayload(updated, {
      phase: updated.phase,
      activeEventSequence: updated.activeEventSequence ?? null,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 购物端点
app.post('/game/:sessionId/shop', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { itemId } = body ?? {};
  if (typeof itemId !== 'string' || !itemId) {
    return c.json({ error: 'itemId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const {
      player,
      itemName,
      shopNarrative,
      shopNarrativePositive,
      shopBuffLabelsAdded,
      shopBuffLabelsRemoved,
      shopTagsAdded,
      shopTagsRemoved,
    } = applyShopPurchase(session, itemId);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({
      player,
      itemName,
      shopNarrative,
      shopNarrativePositive,
      shopBuffLabelsAdded,
      shopBuffLabelsRemoved,
      shopTagsAdded,
      shopTagsRemoved,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 装备典当端点
app.post('/game/:sessionId/pawn', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { itemId } = body ?? {};
  if (typeof itemId !== 'string' || !itemId) {
    return c.json({ error: 'itemId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const result = pawnItem(session.player, itemId);
    if (!result.success || !result.player) {
      return c.json({ error: result.message ?? '典当失败' }, 400);
    }
    session.player = result.player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player: session.player, pawnValue: result.pawnValue });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/housing', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { tierId } = body ?? {};
  if (typeof tierId !== 'string' || !tierId) {
    return c.json({ error: 'tierId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const result = applyHousingChange(session.player, tierId as HousingTierId);
    if (!result.success || !result.player) {
      return c.json({ error: result.message }, 400);
    }
    session.player = result.player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player: session.player, message: result.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/home-facility', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { facilityId } = body ?? {};
  if (typeof facilityId !== 'string' || !facilityId) {
    return c.json({ error: 'facilityId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const result = applyHomeFacilityUpgrade(session.player, facilityId as HomeFacilityId);
    if (!result.success || !result.player) {
      return c.json({ error: result.message }, 400);
    }
    session.player = result.player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player: session.player, message: result.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/home-asset', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { actionId } = body ?? {};
  if (typeof actionId !== 'string' || !actionId) {
    return c.json({ error: 'actionId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const result = applyHomeAssetAction(session.player, actionId as HomeAssetActionId);
    if (!result.success || !result.player) {
      return c.json({ error: result.message }, 400);
    }
    session.player = result.player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player: session.player, message: result.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 贷款端点
app.post('/game/:sessionId/loan', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { amount, durationRounds } = body ?? {};
  if (!Number.isInteger(amount) || amount < 20 || amount > 100) {
    return c.json({ error: 'amount 必须是 20-100 之间的整数' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const result = applyForLoan(session.player, amount, durationRounds);
    if (!result.success || !result.loan) {
      return c.json({ error: result.message ?? '贷款申请失败' }, 400);
    }
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player: session.player, loan: result.loan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 朋友借款端点（无息，8 回合还款，需信用值 ≥ 50）
app.post('/game/:sessionId/friend-loan', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { amount } = body ?? {};
  if (!Number.isInteger(amount) || amount < 10 || amount > 30 || (amount - 10) % 5 !== 0) {
    return c.json({ error: 'amount 必须是 10-30 之间的 5 的倍数' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const result = applyFriendLoan(session.player, amount);
    if (!result.success || !result.loan) {
      return c.json({ error: result.message ?? '朋友借款申请失败' }, 400);
    }
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player: session.player, loan: result.loan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 获取行动和商品列表（前端初始化用）
app.get('/game/meta/actions', (c) => c.json({ actions: ACTIONS }));
app.get('/game/meta/shop', (c) => c.json({ items: SHOP_ITEMS }));
app.get('/game/meta/housing', (c) => c.json({
  tiers: HOUSING_TIERS,
  homeFacilities: HOME_FACILITY_DEFINITIONS,
  cityProfiles: HOUSING_CITY_PROFILES,
  weeklyLivingExpense: WEEKLY_LIVING_EXPENSE,
}));
app.get('/game/meta/clubs', (c) => c.json({ clubs: CLUBS }));
app.get('/game/meta/role-profiles', (c) => c.json({ roleProfiles: ROLE_PROFILES }));

app.get('/game/:sessionId/clubs', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  return c.json({ clubs: buildClubApplicationSummaries(session) });
});

// 申请战队
app.post('/game/:sessionId/apply-club', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { clubId } = body ?? {};
  if (typeof clubId !== 'string' || !clubId) {
    return c.json({ error: 'clubId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  let session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const player = applyClubRequest(session, clubId);
    session.player = player;
    session = activateClubRuntime(session, clubId, 'club-application');
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player: session.player });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 接受/拒绝入队邀请
app.post('/game/:sessionId/team-response', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { accept } = body ?? {};
  if (typeof accept !== 'boolean') {
    return c.json({ error: 'accept 必填（布尔值）' }, 400);
  }

  const storage = makeStorage(c.env);
  let session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const previousPlayer = session.player;
    const player = respondTeamOffer(session, accept);
    if (accept && player.team) {
      player.salaryTracker = {
        lastPayRound: player.round,
        joinedRound: player.round,
        payCycle: 4,
      };
    }
    session.player = player;
    if (accept && player.team) {
      session = activateClubRuntime(session, player.team.clubId, 'team-response');
      session = startTeamOnboardingSequence(
        session,
        deriveTeamOnboardingKind(previousPlayer, player),
      );
    }
    session.leaderboard = buildLeaderboard(session);
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json(buildSessionPayload(session, {
      phase: getSessionPhase(session),
      player,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/team-practice', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { teammateId } = body ?? {};
  if (typeof teammateId !== 'string' || !teammateId) {
    return c.json({ error: 'teammateId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const { player, result } = applyTeamPractice(session, teammateId);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/team-meeting', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const { player, result } = applyTeamMeeting(session);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/locker-room-talk', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const { player, result } = applyLockerRoomTalk(session);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/retain-core-teammate', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const { player, result } = applyRetainCoreTeammate(session);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.post('/game/:sessionId/team-training-focus', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { focus } = body ?? {};
  if (typeof focus !== 'string' || !focus) {
    return c.json({ error: 'focus 必填' }, 400);
  }
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  try {
    const { player, result } = applyTeamTrainingFocus(session, focus);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await saveFinalizedSession(storage, session);
    return c.json({ player, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 主动离队
app.post('/game/:sessionId/leave-team', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  try {
    assertNoActiveEventSequence(session);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '当前事件流程未结束，不能离队' }, 400);
  }
  if (getSessionPhase(session) !== 'action') {
    return c.json({ error: '当前不在行动阶段' }, 400);
  }

  if (!session.player.team) return c.json({ error: '当前没有战队' }, 400);
  if (session.player.pendingMatch) return c.json({ error: '赛事进行中，不能离队' }, 400);

  Object.assign(session.player, clearTeamQualifications(session.player));
  session.player.team = null;
  session.player.consecutiveLosses = 0;
  session.player.fame = Math.max(0, (session.player.fame ?? 0) - 5);
  session.player.tags = session.player.tags.filter((tag) => !TEAM_LIFECYCLE_TAGS.includes(tag as typeof TEAM_LIFECYCLE_TAGS[number]));
  for (const tag of TEAM_LIFECYCLE_TAGS) {
    delete session.player.tagExpiry[tag];
  }
  session.updatedAt = new Date().toISOString();
  await saveFinalizedSession(storage, session);
  return c.json({ player: session.player });
});

// 开场故事生成（仅 history 为空的新局调用）
app.get('/game/:sessionId/intro', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }

  // KV 缓存：intro 只需生成一次，命中直接返回
  const cacheKey = `intro:${id}`;
  try {
    const cached = await c.env.KV.get(cacheKey);
    if (cached) return c.json({ intro: cached });
  } catch { /* KV 不可用时跳过缓存 */ }

  const traitObjects = session.player.traits
    .map((tid) => getTrait(tid))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const background = getBackground(session.player.backgroundId);
  if (!background) return c.json({ error: 'background not found' }, 400);

  const ai = makeAiService(c.env, getExecutionCtx(c));
  const intro = await ai.intro(session.player, traitObjects, background);

  // 写入 KV，永久缓存（intro 内容不会变）
  if (intro) {
    try { await c.env.KV.put(cacheKey, intro); } catch { /* 忽略写失败 */ }
  }

  return c.json({ intro });
});

const STORYLINE_SOCIAL_COPY: Record<ClubStoryline, string> = {
  'dark-horse-run': '最近状态像开了闸，黑马味越来越重',
  'core-rebuild': '阵容换核还在磨，短期波动很正常',
  'chemistry-crisis': '更衣室气氛有点紧，下一场很关键',
  'veteran-decline': '老将状态下滑，队伍需要找到新解法',
  'star-breakout': '队里有人打出了突破赛季的感觉',
  'system-clicking': '战术体系终于开始咬合了',
  'promoted-after-breakout-season': '靠一个爆发赛季打进了更高舞台',
  'fallen-giant': '这个赛季跌得有点狠，重建压力已经摆上台面',
};

function formLabel(form: number): string {
  if (form >= 35) return '状态很热';
  if (form >= 10) return '势头不错';
  if (form <= -35) return '状态低迷';
  if (form <= -10) return '有些起伏';
  return '走势平稳';
}

function displayClubName(session: GameSession, clubId: string): string {
  return resolveClubDisplayInfo(session, clubId)?.name ?? clubId;
}

function displayClubTag(session: GameSession, clubId: string): string {
  return resolveClubDisplayInfo(session, clubId)?.tag ?? clubId;
}

function buildWorldClubSocialPosts(session: GameSession): SocialFeedPost[] {
  const pool = session.worldClubs;
  if (!pool) return [];
  const latestSummary = pool.seasonSummaries?.[0];
  const summaryPosts: SocialFeedPost[] = [];
  if (latestSummary) {
    const darkHorse = latestSummary.darkHorseClubIds.map((id) => displayClubName(session, id)).slice(0, 2);
    const promoted = latestSummary.promotedClubIds.map((id) => displayClubName(session, id)).slice(0, 2);
    const fallen = latestSummary.fallenClubIds.map((id) => displayClubName(session, id)).slice(0, 2);
    const pieces = [
      darkHorse.length > 0 ? `黑马：${darkHorse.join('、')}` : '',
      promoted.length > 0 ? `升级：${promoted.join('、')}` : '',
      fallen.length > 0 ? `低迷：${fallen.join('、')}` : '',
    ].filter(Boolean);
    if (pieces.length > 0) {
      summaryPosts.push({
        author: 'HLTV Brief',
        authorType: 'media',
        handle: '@hltv_brief',
        content: `赛季总结来了，${pieces.join('；')}。新赛季看点不少。`,
      });
    }
  }
  const playerTierChange = session.player.team?.lastTierChange;
  if (
    playerTierChange &&
    latestSummary &&
    playerTierChange.season === latestSummary.season &&
    playerTierChange.round === latestSummary.round
  ) {
    summaryPosts.unshift({
      author: 'Team Desk',
      authorType: 'media',
      handle: '@team_desk',
      content: `${session.player.team?.tag ?? '你的战队'} 赛季结算：${playerTierChange.summary}。新赛季合同与参赛路径已同步调整。`,
    });
  }
  const runtimes = [...pool.activeClubIds, ...pool.relevantClubIds]
    .map((clubId) => pool.runtimeByClubId[clubId])
    .filter((runtime): runtime is ClubRuntimeState => Boolean(runtime))
    .sort((a, b) => {
      const aHeat = a.activeStorylines.length * 20 + a.recentResults.length * 4 + Math.abs(a.currentForm);
      const bHeat = b.activeStorylines.length * 20 + b.recentResults.length * 4 + Math.abs(b.currentForm);
      return bHeat - aHeat;
    });

  const posts: SocialFeedPost[] = [...summaryPosts];
  for (const runtime of runtimes) {
    const club = getClub(runtime.clubId);
    if (!club) continue;
    const clubName = displayClubName(session, runtime.clubId);
    const clubTag = displayClubTag(session, runtime.clubId);
    const storyline = runtime.activeStorylines[0];
    if (storyline) {
      posts.push({
        author: `${clubTag} Watch`,
        authorType: 'media',
        handle: `@${clubTag.toLowerCase()}_watch`,
        content: `${clubName} ${STORYLINE_SOCIAL_COPY[storyline]}，最近整体${formLabel(runtime.currentForm)}。`,
      });
    } else if (runtime.recentResults[0]) {
      const result = runtime.recentResults[0];
      const resultText = result.result === 'win'
        ? '拿下冠军'
        : result.result === 'deep-run'
          ? '打进深轮'
          : result.result === 'early-exit'
            ? '早早出局'
            : '吞下一败';
      posts.push({
        author: clubName,
        authorType: 'club',
        handle: `@${clubTag.toLowerCase()}_gg`,
        content: `${clubName} 最近在 ${result.tier.toUpperCase()} 级赛事${resultText}，训练室今晚继续复盘。`,
      });
    }
    if (posts.length >= 2) break;
  }
  return posts;
}

function dedupeSocialPosts(posts: SocialFeedPost[]): SocialFeedPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = `${post.authorType}|${post.author}|${post.handle}|${post.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildWorldStorylineContext(session: GameSession): string[] {
  const pool = session.worldClubs;
  if (!pool) return [];
  return Object.values(pool.runtimeByClubId)
    .filter((runtime) => runtime.activeStorylines.length > 0 || runtime.recentResults.length > 0)
    .sort((a, b) => b.activeStorylines.length - a.activeStorylines.length || b.updatedRound - a.updatedRound)
    .slice(0, 6)
    .map((runtime) => {
      const name = displayClubName(session, runtime.clubId);
      const story = runtime.activeStorylines.length > 0
        ? `storylines=${runtime.activeStorylines.join(',')}`
        : 'storylines=none';
      const recent = runtime.recentResults[0]
        ? `recent=${runtime.recentResults[0].result}/${runtime.recentResults[0].tier}`
        : 'recent=none';
      return `${name}: ${story}; ${recent}`;
    });
}

// 社区动态：LLM 模拟队友 / 俱乐部 / 对手的 X 风格帖子（每回合缓存一次）
app.get('/game/:sessionId/social-feed', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }

  const allKey = `social:${id}:all`;
  const roundKey = `social:${id}:r${session.player.round}`;
  const MAX_FEED_LENGTH = 20;

  let allPosts: SocialFeedPost[] = [];
  try {
    const allCached = await c.env.KV.get(allKey);
    if (allCached) allPosts = JSON.parse(allCached) as SocialFeedPost[];
  } catch { }

  let roundGenerated = false;
  try {
    const roundCached = await c.env.KV.get(roundKey);
    if (roundCached) roundGenerated = true;
  } catch { }

  if (roundGenerated) {
    return c.json({ posts: allPosts });
  }

  const ai = makeAiService(c.env, getExecutionCtx(c));
  const newPosts = await ai.simulateSocialFeed(
    session.player,
    session.history.slice(-5),
    session.leaderboard,
    session.weeklyNews ?? [],
  );
  const worldPosts = buildWorldClubSocialPosts(session);

  const merged = dedupeSocialPosts([...worldPosts, ...newPosts, ...allPosts]).slice(0, MAX_FEED_LENGTH);

  try {
    await c.env.KV.put(allKey, JSON.stringify(merged), { expirationTtl: 43200 });
    await c.env.KV.put(roundKey, '1', { expirationTtl: 43200 });
  } catch { }

  return c.json({ posts: merged });
});

// 流式叙事：choice 端点不再等待 LLM，前端拿到结果后调这里做流式渲染
app.post('/game/:sessionId/narrate-stream', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }
  if (getSessionPhase(session) !== 'event') {
    return c.json({ error: '当前不在事件阶段' }, 400);
  }

  const body = await c.req.json().catch(() => ({})) as {
    baseNarrative?: string;
    eventTitle?: string;
    choiceLabel?: string;
    success?: boolean;
    customAction?: string;
    matchStats?: MatchStats;
  };

  const ai = makeAiService(c.env, getExecutionCtx(c));
  if (!ai.active) return c.json({ error: 'AI not active' }, 400);

  const input = {
    player: session.player,
    baseNarrative: body.baseNarrative ?? '',
    eventTitle: body.eventTitle ?? '',
    choiceLabel: body.choiceLabel ?? '',
    success: body.success ?? false,
    customAction: body.customAction,
    matchStats: body.matchStats,
  };

  const encoder = new TextEncoder();
  const stream = ai.narrateStream(input);

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
        } catch {}
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      },
    },
  );
});

// 商店购买叙事：购买结算后统一交给 LLM 润色，未启用 AI 时返回原始描述
app.post('/game/:sessionId/narrate-shop', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }

  const body = await c.req.json().catch(() => ({})) as {
    itemName?: string;
    baseNarrative?: string;
    positive?: boolean;
  };

  const baseNarrative = body.baseNarrative ?? '';
  const ai = makeAiService(c.env, getExecutionCtx(c));
  if (!ai.active) return c.json({ narrative: baseNarrative });

  const narrative = await ai.narrateShopPurchase({
    player: session.player,
    itemName: body.itemName ?? '',
    baseNarrative,
    positive: body.positive,
  });

  return c.json({ narrative });
});

// 游戏结束生涯总结（仅 status=ended 时有意义）
app.get('/game/:sessionId/summary', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }
  if (session.status !== 'ended') {
    return c.json({ error: '游戏尚未结束' }, 400);
  }

  const ai = makeAiService(c.env, getExecutionCtx(c));
  const summary = await ai.summarize(
    session.player,
    session.history,
    session.ending,
  );

  return c.json({ summary, ending: session.ending });
});

app.post('/game/:sessionId/end-career', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }

  const endedSession = await endCareerSession(storage, session);
  return c.json(buildSessionPayload(endedSession, {
    phase: endedSession.phase,
    currentEvent: endedSession.currentEvent,
    queuedEvents: endedSession.queuedEvents,
    weeklyNews: endedSession.weeklyNews,
    activeEventSequence: endedSession.activeEventSequence,
  }));
});

export default app;
