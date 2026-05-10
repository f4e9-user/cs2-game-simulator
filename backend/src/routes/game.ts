import { Hono } from 'hono';
import { BACKGROUNDS, getBackground } from '../data/backgrounds.js';
import { TRAITS, getTrait } from '../data/traits.js';
import {
  ACTIONS,
  SHOP_ITEMS,
  applyAction,
  applyChoice,
  applyClubRequest,
  applyForLoan,
  applyShopPurchase,
  computeTraitMods,
  createSession,
  initPlayer,
  generateTeamOffer,
  pawnItem,
  respondTeamOffer,
  rollRandomTraits,
  validateAllocation,
} from '../engine/gameEngine.js';
import { checkTournamentPromotion } from '../engine/stages.js';
import { CLUBS, clubsForStage } from '../data/clubs.js';
import {
  getTournament,
  tournamentsOpenForSignup,
} from '../data/tournaments.js';
import {
  clearTeamQualifications,
  qualificationFallbackSlots,
  qualificationSlotLabel,
  qualificationSlotOwner,
} from '../engine/qualification.js';
import { POINT_POOL } from '../engine/constants.js';
import { makeStorage } from '../storage/index.js';
import { makeAiService } from '../ai/service.js';
import type { ClubTier, Env, PlayerTeam, Stats } from '../types.js';

function teamMeetsRequirement(playerTeam: PlayerTeam | null, required: ClubTier | null): boolean {
  if (!required) return true;
  if (!playerTeam) return false;
  const tierOrder: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
  return tierOrder.indexOf(playerTeam.tier) >= tierOrder.indexOf(required);
}


const app = new Hono<{ Bindings: Env }>();

// AI 路由鉴权：校验请求头携带的 apiToken 是否与 session 匹配
function validateApiToken(authHeader: string | undefined, sessionToken: string): boolean {
  if (!authHeader) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return token === sessionToken;
}

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
  const { name, traitIds, backgroundId, stats } = body ?? {};

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
    const err = validateAllocation(stats as Stats, floor);
    if (err) return c.json({ error: err }, 400);
  }

  try {
    const player = initPlayer({
      name: typeof name === 'string' ? name : '',
      traitIds,
      backgroundId,
      stats: stats as Stats | undefined,
    });
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const session = createSession(player, seed);

    const storage = makeStorage(c.env);
    await storage.sessions.save(session);

    return c.json({
      sessionId: session.id,
      apiToken: session.apiToken,
      player: session.player,
      currentEvent: session.currentEvent,
      leaderboard: session.leaderboard,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.get('/game/:sessionId', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  // Annotate with current promotion check so the UI can show next-stage hints.
  const promotion = checkTournamentPromotion(session.player);
  return c.json({ ...session, promotion });
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
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);

  const ai = makeAiService(c.env);

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
    // 面试 post-handler 需要 clubId，但 applyChoice 内部会清空 pendingApplication
    // 提前保存，供下方生成入队邀请时使用
    const preChoicePendingApplication = session.player.pendingApplication;
    const { session: updated, result } = applyChoice(session, choiceId, customRollBonus);

    // 自由行动时：用自定义行动作为叙事重写依据，不拼接默认叙事
    if (customNarrativePrefix) {
      result.choiceLabel = customActionTrimmed.slice(0, 30);
    }

    const polished = await ai.narrate({
      player: updated.player,
      baseNarrative: result.narrative,
      eventTitle: result.eventTitle,
      choiceLabel: result.choiceLabel,
      success: result.success,
      customAction: hasCustomAction ? customActionTrimmed : undefined,
      matchStats: result.matchStats,
    });
    result.narrative = polished;

    const lastIdx = updated.history.length - 1;
    if (lastIdx >= 0) {
      updated.history[lastIdx] = {
        ...updated.history[lastIdx]!,
        narrative: polished,
      };
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

    await storage.sessions.save(updated);

    return c.json({
      result,
      player: updated.player,
      currentEvent: updated.currentEvent,
      status: updated.status,
      ending: updated.ending,
      promotion: checkTournamentPromotion(updated.player),
      leaderboard: updated.leaderboard,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

app.get('/game/meta/rules', (c) =>
  c.json({
    pointPool: POINT_POOL,
  }),
);

// Tournaments whose signup window is open this week for the player's stage.
app.get('/game/:sessionId/tournaments', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  const playerPoints =
    session.leaderboard?.find((t) => t.isPlayer)?.points ?? 0;
  const open = tournamentsOpenForSignup(
    session.player.stage,
    session.player.fame ?? 0,
    playerPoints,
    session.player.week ?? 1,
    session.player.year ?? 1,
    {
      ...(session.player.qualificationSlots ?? {}),
      ...(session.player.teamQualificationSlots ?? {}),
    },
  );
  return c.json({
    open,
    pendingMatch: session.player.pendingMatch ?? null,
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
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);

  const t = getTournament(tournamentId);
  if (!t) return c.json({ error: '未知赛事' }, 400);
  if (!t.stages.includes(session.player.stage)) {
    return c.json({ error: '当前阶段不符合参赛资格' }, 400);
  }
  if (
    t.fameRequired !== undefined &&
    (session.player.fame ?? 0) < t.fameRequired
  ) {
    return c.json(
      { error: `名气不足，需要 ≥ ${t.fameRequired}（当前 ${session.player.fame}）` },
      400,
    );
  }
  const playerPoints = session.leaderboard?.find((t) => t.isPlayer)?.points ?? 0;
  if (t.pointsRequired !== undefined && playerPoints < t.pointsRequired) {
    return c.json(
      { error: `战队积分不足，需要 ≥ ${t.pointsRequired}（当前 ${playerPoints}）` },
      400,
    );
  }
  // 战队门槛校验：持有该赛事所需资格门票时可破格参加（只要有战队即可）
  const teamReq = t.teamRequirement ?? null;
  if (teamReq !== null && !teamMeetsRequirement(session.player.team, teamReq)) {
    const hasQualTicket = !!t.qualificationTargets?.length &&
      t.qualificationTargets
        .flatMap((slot) => qualificationFallbackSlots(slot))
        .some((slot) => {
          const owner = qualificationSlotOwner(slot);
          const pool = owner === 'team'
            ? (session.player.teamQualificationSlots ?? {})
            : (session.player.qualificationSlots ?? {});
          return (pool[slot] ?? 0) > 0;
        });
    if (!session.player.team) {
      return c.json({ error: `该赛事需要签约战队才能参加` }, 400);
    }
    if (!hasQualTicket) {
      const tierLabels: Record<ClubTier, string> = {
        youth: '青训',
        'semi-pro': '半职业',
        pro: '职业',
        top: '顶级',
      };
      return c.json(
        { error: `该赛事需要 ${tierLabels[teamReq]} 及以上战队（当前 ${tierLabels[session.player.team.tier]}），或持有资格门票破格参加` },
        400,
      );
    }
  }
  const week = session.player.week ?? 1;
  const inWindow =
    t.signupWeeks === 'always' || t.signupWeeks.includes(week);
  if (!inWindow) {
    return c.json({ error: '当前周不在该赛事报名窗口' }, 400);
  }
  if (session.player.pendingMatch) {
    return c.json({ error: '已经报名了一项赛事，先打完再说' }, 400);
  }
  let usedQualificationSlot: string | undefined;
  let usedQualificationSlotOwner: 'player' | 'team' | undefined;
  if (t.qualificationTargets?.length) {
    const usedSlot = t.qualificationTargets
      .flatMap((slot) => qualificationFallbackSlots(slot))
      .find((slot) => {
        const owner = qualificationSlotOwner(slot);
        const pool = owner === 'team'
          ? (session.player.teamQualificationSlots ?? {})
          : (session.player.qualificationSlots ?? {});
        return (pool[slot] ?? 0) > 0;
      });
    if (!usedSlot) {
      return c.json({ error: '缺少对应资格门票' }, 400);
    }
    usedQualificationSlot = usedSlot;
    usedQualificationSlotOwner = qualificationSlotOwner(usedSlot);
    if (usedQualificationSlotOwner === 'team') {
      session.player.teamQualificationSlots = {
        ...(session.player.teamQualificationSlots ?? {}),
        [usedSlot]: Math.max(0, (session.player.teamQualificationSlots?.[usedSlot] ?? 0) - 1),
      };
    } else {
      session.player.qualificationSlots = {
        ...(session.player.qualificationSlots ?? {}),
        [usedSlot]: Math.max(0, (session.player.qualificationSlots?.[usedSlot] ?? 0) - 1),
      };
    }
  }

  const year = session.player.year ?? 1;
  // Schedule the match 2 weeks out so the player gets a full action phase
  // in the round after signup (week+1 shows the prep event with AP=100),
  // and AP is only locked on the actual match week (week+2).
  const adv1 = week >= 48 ? { year: year + 1, week: 1 } : { year, week: week + 1 };
  const next =
    adv1.week >= 48
      ? { year: adv1.year + 1, week: 1 }
      : { year: adv1.year, week: adv1.week + 1 };

  session.player.pendingMatch = {
    tournamentId: t.id,
    tier: t.tier,
    name: t.name,
    displayName: t.displayName,
    progressionTier: t.progressionTier,
    entryType: t.entryType,
    qualificationSlotUsed: usedQualificationSlot,
    qualificationSlotOwner: usedQualificationSlotOwner,
    resolveYear: next.year,
    resolveWeek: next.week,
    stageIndex: 0,
  };
  session.updatedAt = new Date().toISOString();
  await storage.sessions.save(session);

  return c.json({
    pendingMatch: session.player.pendingMatch,
    player: session.player,
  });
});

app.post('/game/:sessionId/withdraw', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
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
      if (session.player.pendingMatch.qualificationSlotOwner === 'team') {
        session.player.teamQualificationSlots = {
          ...(session.player.teamQualificationSlots ?? {}),
          [slot]: (session.player.teamQualificationSlots?.[slot] ?? 0) + 1,
        };
      } else {
        session.player.qualificationSlots = {
          ...(session.player.qualificationSlots ?? {}),
          [slot]: (session.player.qualificationSlots?.[slot] ?? 0) + 1,
        };
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
    session.player.stats.money = Math.max(0, session.player.stats.money - 3);
    penalties.push('资金 -30K');
  }

  if (!session.player.tags.includes('forfeit-recent')) {
    session.player.tags = [...session.player.tags, 'forfeit-recent'];
  }

  session.player.pendingMatch = null;
  session.updatedAt = new Date().toISOString();
  await storage.sessions.save(session);
  return c.json({ player: session.player, penalties });
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
    const { actionResult, player } = applyAction(session, actionId);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await storage.sessions.save(session);
    return c.json({ actionResult, player });
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
    await storage.sessions.save(session);
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

  try {
    const result = pawnItem(session.player, itemId);
    if (!result.success) {
      return c.json({ error: result.message ?? '典当失败' }, 400);
    }
    session.updatedAt = new Date().toISOString();
    await storage.sessions.save(session);
    return c.json({ player: session.player, pawnValue: result.pawnValue });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 贷款端点
app.post('/game/:sessionId/loan', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { amount } = body ?? {};
  if (!Number.isInteger(amount)) {
    return c.json({ error: 'amount 必须是整数' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);

  try {
    const result = applyForLoan(session.player, amount);
    if (!result.success || !result.loan) {
      return c.json({ error: result.message ?? '贷款申请失败' }, 400);
    }
    session.updatedAt = new Date().toISOString();
    await storage.sessions.save(session);
    return c.json({ player: session.player, loan: result.loan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

// 获取行动和商品列表（前端初始化用）
app.get('/game/meta/actions', (c) => c.json({ actions: ACTIONS }));
app.get('/game/meta/shop', (c) => c.json({ items: SHOP_ITEMS }));
app.get('/game/meta/clubs', (c) => c.json({ clubs: CLUBS }));

// 申请战队
app.post('/game/:sessionId/apply-club', async (c) => {
  const id = c.req.param('sessionId');
  const body = await c.req.json().catch(() => ({}));
  const { clubId } = body ?? {};
  if (typeof clubId !== 'string' || !clubId) {
    return c.json({ error: 'clubId 必填' }, 400);
  }

  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);

  try {
    const player = applyClubRequest(session, clubId);
    session.player = player;
    session.updatedAt = new Date().toISOString();
    await storage.sessions.save(session);
    return c.json({ player });
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
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);

  try {
    const player = respondTeamOffer(session, accept);
    if (accept && player.team) {
      player.salaryTracker = {
        lastPayRound: player.round,
        joinedRound: player.round,
        payCycle: 4,
      };
    }
    session.player = player;
    // When accepting, update the player's leaderboard entry to reflect the real team name/tag/region.
    if (accept && player.team && session.leaderboard) {
      session.leaderboard = session.leaderboard.map((t) =>
        t.isPlayer
          ? { ...t, name: player.team!.name, tag: player.team!.tag, region: player.team!.region }
          : t,
      );
    }
    session.updatedAt = new Date().toISOString();
    await storage.sessions.save(session);
    return c.json({ player, leaderboard: session.leaderboard });
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

  if (!session.player.team) return c.json({ error: '当前没有战队' }, 400);
  if (session.player.pendingMatch) return c.json({ error: '赛事进行中，不能离队' }, 400);

  Object.assign(session.player, clearTeamQualifications(session.player));
  session.player.team = null;
  session.player.consecutiveLosses = 0;
  session.player.fame = Math.max(0, (session.player.fame ?? 0) - 5);
  session.updatedAt = new Date().toISOString();
  await storage.sessions.save(session);
  return c.json({ player: session.player });
});

// 事件个性化（玩家看到选项前调用，根据特质/属性改写 narrative 和 choice description）
app.get('/game/:sessionId/personalize-event', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }
  if (!session.currentEvent) return c.json({ error: 'no current event' }, 400);

  const traitObjects = session.player.traits
    .map((tid) => getTrait(tid))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const ai = makeAiService(c.env);
  const personalized = await ai.personalizeEvent(session.player, traitObjects, session.currentEvent);

  // null 表示 LLM 未启用或解析失败，前端保持原文
  return c.json({ personalized });
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

  const ai = makeAiService(c.env);
  const intro = await ai.intro(session.player, traitObjects, background);

  // 写入 KV，永久缓存（intro 内容不会变）
  if (intro) {
    try { await c.env.KV.put(cacheKey, intro); } catch { /* 忽略写失败 */ }
  }

  return c.json({ intro });
});

// 社区动态：LLM 模拟队友 / 俱乐部 / 对手的 X 风格帖子（每回合缓存一次）
app.get('/game/:sessionId/social-feed', async (c) => {
  const id = c.req.param('sessionId');
  const storage = makeStorage(c.env);
  const session = await storage.sessions.load(id);
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (!validateApiToken(c.req.header('authorization'), session.apiToken)) {
    return c.json({ error: '无效的 API Token' }, 401);
  }

  // KV 缓存：同一回合内容不变，直接返回
  const cacheKey = `social:${id}:r${session.player.round}`;
  try {
    const cached = await c.env.KV.get(cacheKey);
    if (cached) return c.json({ posts: JSON.parse(cached) });
  } catch { /* KV 不可用时跳过缓存 */ }

  const ai = makeAiService(c.env);
  const posts = await ai.simulateSocialFeed(
    session.player,
    session.history.slice(-5),
    session.leaderboard,
  );

  // 写入 KV，TTL 12 小时（同回合内复用，跨回合自动过期）
  try {
    await c.env.KV.put(cacheKey, JSON.stringify(posts), { expirationTtl: 43200 });
  } catch { /* 忽略写失败 */ }

  return c.json({ posts });
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

  const ai = makeAiService(c.env);
  const summary = await ai.summarize(
    session.player,
    session.history,
    session.ending,
  );

  return c.json({ summary, ending: session.ending });
});

export default app;
