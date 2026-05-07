import { EVENT_POOL, PROMOTION_EVENTS } from '../data/events/index.js';
import { getGate } from './stages.js';
import { getTrait } from '../data/traits.js';
import { CLUBS } from '../data/clubs.js';
import type { EventDef, Player, Rival, Teammate, PendingMatch, ClubTier } from '../types.js';

export interface EventContext {
  player: Player;
  recentEventIds: string[];
  rng: () => number;
}

function dynamicTags(player: Player): string[] {
  const out: string[] = [];
  // Stress is now 0-100; 60+ counts as "stressed".
  if (player.stress >= 60) out.push('stressed');
  if (player.fame >= 15) out.push('famous');
  if (player.stats.money <= 1) out.push('cash-strapped');
  if (player.stats.constitution <= 2) out.push('frail');
  // Major aftermath weeks: surface broadcast events to the non-participant.
  // Major signups close at week 22/46; matches resolve week 23/47; we show
  // broadcast at week 24/48 to give it space.
  const w = player.week ?? 1;
  const isMajorAftermath = w === 24 || w === 48;
  const inMajorMatch = player.pendingMatch?.tournamentId === 't-major';
  if (isMajorAftermath && !inMajorMatch) out.push('major-broadcast');

  // ── 特质派生 tag ───────────────────────────────────────────────
  // elite-prospect：有"枪法天才"(aim-god) 或 "天梯之王"(ranked-warrior) 特质
  const traitTags = player.traits.flatMap((id) => getTrait(id)?.tags ?? []);
  if (traitTags.includes('aimer') || traitTags.includes('solo')) {
    out.push('elite-prospect');
  }

  // ── 参赛经验 tag ───────────────────────────────────────────────
  // has-open-match-exp：参加过城市赛或平台赛合计超过1次（被星探发现的前提）
  const tp = player.tierParticipations ?? {};
  const openMatchCount = (tp['city'] ?? 0) + (tp['platform'] ?? 0);
  if (openMatchCount > 1) out.push('has-open-match-exp');

  // ── 战队申请系统 tag ─────────────────────────────────────────────
  const app = player.pendingApplication;
  if (app && player.round >= app.responseRound) {
    out.push('application-response-ready');
    // 检查是否有面试 tag（response 成功后写入）
    if (player.tags.includes('interview-pending')) out.push('interview-ready');
  }

  // ── 新入队 tag（加入战队后首回合）─────────────────────────────────
  if (player.team && player.team.joinedRound === player.round) {
    out.push('just-joined-team');
  }

  // ── 在队生命周期 tag ──────────────────────────────────────────────
  if (player.team) {
    out.push('has-team');
    // 合约到期（每 48 回合）
    if ((player.round - player.team.joinedRound) > 0 &&
        (player.round - player.team.joinedRound) % 48 === 0) {
      out.push('contract-up');
    }
    // 连败 3+ = 面临被踢
    if ((player.consecutiveLosses ?? 0) >= 3) {
      out.push('losing-streak');
    }
    // 更高档俱乐部挖角：检查是否有更高档且满足门槛的俱乐部
    const tierOrder: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
    const currentIdx = tierOrder.indexOf(player.team.tier);
    const stageOrder = ['rookie', 'youth', 'second', 'pro', 'star', 'veteran', 'retired'];
    const playerIdx = stageOrder.indexOf(player.stage);
    const hasPromote = CLUBS.some((c) => {
      const reqIdx = stageOrder.indexOf(c.requiredStage);
      if (playerIdx < reqIdx) return false;
      if (c.requiredFame !== undefined && (player.fame ?? 0) < c.requiredFame) return false;
      return tierOrder.indexOf(c.tier) > currentIdx;
    });
    if (hasPromote) out.push('promote-eligible');
  }

  // ── 对手联动 tag ───────────────────────────────────────────────────
  // rival-scout-eligible: 无战队 + 名气≥20 + 有公开赛经验 → 星探有机会发现你
  if (!player.team && (player.fame ?? 0) >= 20 && openMatchCount > 1) {
    out.push('rival-scout-eligible');
  }
  // rival-match-pressure: 有战队 + 有待打赛事 → 赛前对手战术互动
  if (player.team && player.pendingMatch) {
    out.push('rival-match-pressure');
  }

  return out;
}

function stateWeight(e: EventDef, player: Player): number {
  let w = e.weight ?? 1;
  if (player.fame >= 15 && e.type === 'media') w *= 1.6;
  if (player.stats.money <= 1) {
    if (e.type === 'betting') w *= 1.8;
    if (e.type === 'cheat') w *= 1.5;
  }
  if (player.stats.constitution <= 2 && e.type === 'life') w *= 1.4;
  if (player.stress >= 60 && e.requireTags?.includes('stressed')) w *= 2;
  // Force broadcast events to dominate when in Major aftermath.
  if (e.requireTags?.includes('major-broadcast')) w *= 5;
  // 赌徒特质 → 赌狗/上头类饰品事件权重翻倍
  if (e.id.startsWith('skin-gamble-')) {
    const traitTags = player.traits.flatMap((id) => getTrait(id)?.tags ?? []);
    if (traitTags.includes('gambler')) w *= 2;
  }
  // 自由人时 tryout 类事件权重提升（申请战队需求）
  if (!player.team && e.type === 'tryout') w *= 1.5;
  // 有战队时 team 类事件权重提升
  if (player.team && e.type === 'team') w *= 1.6;
  // star 性格队友 + 连败：队内冲突触发概率翻倍
  if (
    e.id === 'chain-team-conflict' &&
    (player.consecutiveLosses ?? 0) >= 2 &&
    (player.roster ?? []).some((tm) => tm.personality === 'star')
  ) {
    w *= 2;
  }
  return Math.max(0.05, w);
}

// 赛前准备事件：在报名赛事后到比赛周之前的回合出现
export function buildTournamentPrepEvent(pm: PendingMatch): EventDef {
  return {
    id: `tourney-prep-${pm.tournamentId}-${pm.stageIndex}`,
    type: 'match',
    title: `赛前准备 — ${pm.name}`,
    narrative: `距离 ${pm.name} 第 ${pm.stageIndex + 1} 阶段比赛还有几天，你需要做好准备。`,
    stages: ['rookie', 'youth', 'second', 'pro', 'star', 'veteran'],
    difficulty: 1,
    choices: [
      {
        id: 'demo-review',
        label: '分析对手录像',
        description: '研究对手的战术习惯，寻找可利用的规律。',
        check: { primary: 'intelligence', dc: 8, traitBonuses: { tactical: 2, igl: 1 } },
        success: {
          narrative: '你发现对手在某个点位有固定的战术偏好，这会是关键。',
          buffAdd: {
            id: 'pre-match-intel',
            label: '赛前情报',
            actionTag: 'match',
            growthKey: 'intelligence',
            multiplier: 1.15,
            remainingUses: 2,
          },
        },
        failure: {
          narrative: '录像看了两个小时，没找到什么特别的规律。',
          fatigueDelta: 10,
        },
      },
      {
        id: 'physical-prep',
        label: '体能保持训练',
        description: '轻量体能练习，保持状态不退步。',
        check: { primary: 'mentality', dc: 5, traitBonuses: { grinder: 1 } },
        success: {
          narrative: '轻量训练到位，身体状态维持得不错。',
          fatigueDelta: -10,
          feelDelta: 1,
        },
        failure: {
          narrative: '练习感觉很干，状态也没起色。',
          fatigueDelta: 5,
        },
      },
      {
        id: 'mental-reset',
        label: '心态调整',
        description: '放松放松，不要在比赛前把自己绷死。',
        check: { primary: 'mentality', dc: 4, traitBonuses: { steady: 2 } },
        success: {
          narrative: '脑子里的杂念少了一些，感觉可以专注上场了。',
          stressDelta: -2,
          fatigueDelta: -5,
        },
        failure: {
          narrative: '越想放松越焦虑，最后也没怎么休息到。',
          stressDelta: 1,
        },
      },
    ],
  };
}

export function pickEvent(ctx: EventContext): EventDef | null {
  const { player, recentEventIds, rng } = ctx;
  const realTags = new Set(player.tags);
  const synthTags = new Set([...player.tags, ...dynamicTags(player)]);

  if ((player.restRounds ?? 0) > 0) {
    const restPool = EVENT_POOL.filter((e) => e.type === 'rest');
    if (restPool.length > 0) return weightedPick(restPool, rng, () => 1);
  }

  // Promotion pending: inject the stage-specific narrative event.
  if (player.promotionPending) {
    const gate = getGate(player.stage);
    if (gate) {
      const ev = PROMOTION_EVENTS.find((e) => e.id === gate.promotionEventId);
      if (ev) return ev;
    }
  }

  // 赛事隔离：报名赛事期间只出现赛前准备事件
  if (player.pendingMatch) {
    return buildTournamentPrepEvent(player.pendingMatch);
  }

  const eligible = EVENT_POOL.filter((e) => {
    if (e.type === 'rest') return false;
    if (e.type === 'routine') return false; // 日常行动改为行动面板，不再随机出现
    if (!e.stages.includes(player.stage)) return false;
    if (recentEventIds.includes(e.id)) return false;
    if (e.requireTags?.some((t) => !synthTags.has(t))) return false;
    if (e.forbidTags?.some((t) => realTags.has(t))) return false;
    return true;
  });

  if (eligible.length === 0) {
    const fallback = EVENT_POOL.filter(
      (e) => e.type !== 'rest' && e.type !== 'routine' && e.stages.includes(player.stage),
    );
    if (fallback.length === 0) return null;
    return weightedPick(fallback, rng, (e) => stateWeight(e, player));
  }

  return weightedPick(eligible, rng, (e) => stateWeight(e, player));
}

function weightedPick(
  events: EventDef[],
  rng: () => number,
  weightFn: (e: EventDef) => number,
): EventDef {
  const weights = events.map((e) => Math.max(0.01, weightFn(e)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < events.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return events[i]!;
  }
  return events[events.length - 1]!;
}

// Replace {rival0}/{rival1}/... placeholders with actual rival names. Falls
// back to "某队" when index is out of range.
export function substituteRivals(text: string, rivals: Rival[]): string {
  return text.replace(/\{rival(\d+)\}/g, (_, i) => {
    const idx = Number(i);
    return rivals[idx]?.name ?? '某队';
  });
}

// Replace {teammate0}/{teammate1}/... placeholders with actual teammate names.
// Falls back to "某队友" when index is out of range or roster is empty.
export function substituteTeammates(text: string, teammates: Teammate[]): string {
  return text.replace(/\{teammate(\d+)\}/g, (_, i) => {
    const idx = Number(i);
    return teammates[idx]?.name ?? '某队友';
  });
}

export function toPublicEvent(e: EventDef, rivals: Rival[] = [], teammates: Teammate[] = []) {
  const sub = (s: string) => substituteRivals(s, rivals);
  const subAll = (s: string) => substituteTeammates(sub(s), teammates);
  return {
    id: e.id,
    type: e.type,
    title: subAll(e.title),
    narrative: subAll(e.narrative),
    choices: e.choices.map((c) => ({
      id: c.id,
      label: subAll(c.label),
      description: subAll(c.description),
    })),
  };
}
