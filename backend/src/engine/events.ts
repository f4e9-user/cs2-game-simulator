import { PROMOTION_EVENTS, getEventById, getEventRegistry } from '../data/events/index.js';
import { getGate } from './stages.js';
import { getTrait } from '../data/traits.js';
import { CLUBS } from '../data/clubs.js';
import { getClubProfile } from '../data/clubProfiles.js';
import {
  derivePlayerTeamIdentities,
  deriveTeammateIdentities,
} from './teamIdentity.js';
import { calcSynergyBonus } from './synergy.js';
import { deriveRolePressure } from './roleTransition.js';
import type { AiEventPickCandidate } from '../ai/eventCache.js';
import type { EventDef, Player, Rival, Teammate, TeammateRole, PendingMatch, ClubTier, LeaderboardTeam, TeamIdentity } from '../types.js';
import { pickTournamentContextEvent } from './tournamentContext.js';
import { effectiveHousingEventWeightMultiplier, housingEventTags } from './housing.js';

export interface EventContext {
  player: Player;
  recentEventIds: string[];
  rng: () => number;
  leaderboard?: LeaderboardTeam[];
  aiEvents?: EventDef[];
  aiEventCandidates?: AiEventPickCandidate[];
}

function playerHasTeamIdentity(player: Player, identity: TeamIdentity): boolean {
  if (player.visibleTeamIdentity === identity) return true;
  if (player.visibleTeamIdentity === 'star-caller' && (identity === 'star' || identity === 'caller')) return true;
  return derivePlayerTeamIdentities(player, player.roster ?? []).includes(identity);
}

function teammateHasTeamIdentity(player: Player, teammate: Teammate, identity: TeamIdentity): boolean {
  if (teammate.visibleIdentity === identity) return true;
  return deriveTeammateIdentities(teammate, player.roster ?? []).includes(identity);
}

function teammateWithIdentity(player: Player, identity: TeamIdentity): Teammate | undefined {
  return (player.roster ?? []).find((tm) => teammateHasTeamIdentity(player, tm, identity));
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
  const inMajorMatch = player.pendingMatch?.tier === 'major';
  if (isMajorAftermath && !inMajorMatch) out.push('major-broadcast');

  // ── 特质派生 tag ───────────────────────────────────────────────
  // elite-prospect：有"枪法天才"(aim-god) 或 "天梯之王"(ranked-warrior) 特质
  const traitTags = player.traits.flatMap((id) => getTrait(id)?.tags ?? []);
  if (traitTags.includes('aimer') || traitTags.includes('solo')) {
    out.push('elite-prospect');
  }

  // ── 参赛经验 tag ───────────────────────────────────────────────
  // has-open-match-exp：参加过 B/A 级赛事合计超过1次（被星探发现的前提）
  const tp = player.tierParticipations ?? {};
  const openMatchCount = (tp['b'] ?? 0) + (tp['a'] ?? 0);
  if (openMatchCount > 1) out.push('has-open-match-exp');

  // ── 战队申请系统 tag ─────────────────────────────────────────────
  const app = player.pendingApplication;
  // interview-pending 存在时说明已收到回复并等待面试，不再重复合成 application-response-ready
  if (app && player.round >= app.responseRound && !player.tags.includes('interview-pending')) {
    out.push('application-response-ready');
  }
  // interview-pending 由 chain-club-response 成功后写入，独立于 pendingApplication
  if (player.tags.includes('interview-pending')) {
    out.push('interview-ready');
  }

  // ── 新入队 tag（加入战队后首回合）─────────────────────────────────
  if (player.team && player.team.joinedRound === player.round) {
    out.push('just-joined-team');
  }

  // ── 在队生命周期 tag ──────────────────────────────────────────────
  if (player.team) {
    out.push('has-team');
    const playerIsCaller = playerHasTeamIdentity(player, 'caller');
    const playerIsStar = playerHasTeamIdentity(player, 'star');
    const starTeammate = teammateWithIdentity(player, 'star');
    const callerTeammate = teammateWithIdentity(player, 'caller');
    if (player.visibleTeamIdentity === 'star-caller' || (playerIsCaller && playerIsStar)) {
      out.push('player-star-caller');
    } else {
      if (playerIsCaller) out.push('player-team-caller');
      if (playerIsStar) out.push('player-team-star');
    }
    if (starTeammate) out.push('team-has-star-teammate');
    if (callerTeammate) out.push('team-has-caller-teammate');

    const hasConflictPressure =
      (player.teamTrust ?? 50) < 40 ||
      (player.consecutiveLosses ?? 0) >= 2 ||
      player.tags.includes('locker-tension') ||
      (starTeammate && (starTeammate.chemistry ?? 50) <= 35) ||
      (callerTeammate && (callerTeammate.chemistry ?? 50) <= 35);
    if (hasConflictPressure) out.push('team-influence-conflict-risk');

    if (playerIsCaller && starTeammate && hasConflictPressure) {
      out.push('team-caller-star-conflict-risk');
    }
    if (playerIsStar && callerTeammate && hasConflictPressure) {
      out.push('team-star-caller-conflict-risk');
    }
    if (!playerIsCaller && !playerIsStar && starTeammate && callerTeammate && hasConflictPressure) {
      out.push('team-ordinary-politics-risk');
    }
    if ((playerIsCaller || playerIsStar) && starTeammate && callerTeammate && (player.teamTrust ?? 50) >= 55 && !player.tags.includes('locker-tension')) {
      out.push('team-positive-voice-risk');
    }
    if (playerIsStar && ((player.consecutiveLosses ?? 0) >= 1 || player.pendingMatch || (player.teamTrust ?? 50) < 45)) {
      out.push('team-resource-tilt-risk');
    }
    if (
      playerIsStar &&
      !playerIsCaller &&
      (
        calcSynergyBonus(player, player.roster ?? []) <= 0 ||
        (player.consecutiveLosses ?? 0) >= 2 ||
        player.tags.includes('locker-tension') ||
        Boolean(player.pendingDeparture?.revealed)
      )
    ) {
      out.push('team-lineup-advice-risk');
    }
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
    const stageOrder = ['rookie', 'youth', 'second', 'pro', 'retired'];
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

  // ── 信用值 tag ────────────────────────────────────────────────
  if ((player.creditScore ?? 100) < 50) out.push('low-credit');
  out.push(...housingEventTags(player));

  // ── 家人危机触发 tag ──────────────────────────────────────────
  const familyCrisisCd = player.tagExpiry?.['family-crisis-cd'];
  const familyCrisisTriggerable =
    (player.familyBailoutCount ?? 0) >= 3 &&
    (player.creditScore ?? 100) < 60 &&
    !player.pendingFamilyCrisis &&
    (!familyCrisisCd || player.round >= familyCrisisCd);
  if (familyCrisisTriggerable) out.push('needs-family-crisis');

  // ── 破产救济 tag ───────────────────────────────────────────────
  const bailoutReady =
    (player.stats.money ?? 0) <= 0 &&
    (player.consecutiveBrokeRounds ?? 0) >= 2 &&
    (player.bailoutCooldown ?? 0) <= 0;
  if (bailoutReady) {
    out.push('needs-bailout');
  }

  const teamBailoutReady =
    player.team &&
    (player.stats.money ?? 0) <= 0 &&
    (player.teamBailoutCooldown ?? 0) <= 0;
  if (teamBailoutReady) out.push('needs-team-bailout');

  // ── 角色转型 tag ──────────────────────────────────────────────────
  if (player.preferredRole && !player.roleTransition && !player.roleCrystallized) {
    const allRoles: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];
    if (allRoles.some((r) => hasRoleTransitionMainTrigger(player, r))) {
      out.push('role-transition-eligible');
    }
  }
  if (player.roleTransition && player.round >= player.roleTransition.resolveRound) {
    out.push('role-transition-resolve');
  }
  if (player.roleTransition) {
    out.push('role-transition-active');
  }

  // ── 前队友联系 tag ────────────────────────────────────────────────
  if (player.tags.includes('old-teammate-contact')) {
    out.push('old-teammate-contact');
  }

  // ── 队友转会预警 tag ──────────────────────────────────────────────
  const pd = player.pendingDeparture;
  if (pd && player.team && player.roster) {
    if (!pd.rumorShown && player.round >= pd.departureRound - 7) {
      out.push('teammate-transfer-rumor-due');
    }
    if (pd.rumorShown && !pd.revealed && player.round >= pd.departureRound - 4) {
      out.push('teammate-transfer-reveal-due');
    }
  }

  return out;
}

const ROLE_STAT_REQUIREMENT: Record<TeammateRole, { stat: keyof Player['stats']; min: number }> = {
  IGL: { stat: 'intelligence', min: 12 },
  AWPer: { stat: 'agility', min: 12 },
  Entry: { stat: 'agility', min: 10 },
  Support: { stat: 'mentality', min: 10 },
  Lurker: { stat: 'intelligence', min: 10 },
};

export { ROLE_STAT_REQUIREMENT };

function canTransitionTo(player: Player, role: TeammateRole): boolean {
  if (player.preferredRole === role) return false;
  const req = ROLE_STAT_REQUIREMENT[role];
  if (!req) return false;
  return (player.stats[req.stat] ?? 0) >= req.min;
}

function hasRoleTransitionMainTrigger(player: Player, role: TeammateRole): boolean {
  if (!canTransitionTo(player, role)) return false;
  if (!player.team || !player.roster) return false;
  if (role !== 'IGL' && role !== 'AWPer') return false;
  const filledRoles = new Set(player.roster.map((tm) => tm.role));
  if (player.activeRole) filledRoles.add(player.activeRole);
  return !filledRoles.has(role);
}

function stateWeight(e: EventDef, player: Player): number {
  let w = e.weight ?? 1;
  if (player.fame >= 15 && e.type === 'media') w *= 1.6;
  if (player.stats.money <= 1) {
    if (e.type === 'betting') w *= 1.8;
    if (e.type === 'cheat') w *= 1.5;
  }
  if (player.stats.constitution <= 2 && e.type === 'life') w *= 1.4;
  if (e.type === 'life') w *= effectiveHousingEventWeightMultiplier(player);
  if (player.stress >= 60 && e.requireTags?.includes('stressed')) w *= 2;
  // Force broadcast events to dominate when in Major aftermath.
  if (e.requireTags?.includes('major-broadcast')) w *= 5;
  // 饰品事件状态联动权重修正
  if (e.id.startsWith('skin-scam-')) {
    if (player.tags.includes('scammed') || player.tags.includes('phished')) w *= 0.4;
  }
  if (e.id.startsWith('skin-gamble-')) {
    const traitTags = player.traits.flatMap((id) => getTrait(id)?.tags ?? []);
    // gambler 特质 × gambling-spiral 标签可叠加（×2 × ×1.5 = ×3.0），越陷越深
    if (traitTags.includes('gambler')) w *= 2;
    if (player.tags.includes('gambling-spiral')) w *= 1.5;
  }
  if (e.id.startsWith('skin-gray-')) {
    // 灰色接触记录 → 边缘类事件概率联动
    if (player.tags.includes('dirty-money')) w *= 1.5;
    if (player.tags.includes('clean-record')) w *= 0.5;
  }
  if (e.id.startsWith('skin-social-')) {
    // 已建立社交圈 → 饰品社交事件更容易触发
    if (player.tags.includes('social-circle')) w *= 1.3;
  }
  if (e.id.startsWith('skin-market-') && (player.stats.money ?? 0) <= 1) {
    // 几乎破产时抑制市场投机事件（无本金可操作）
    w *= 0.3;
  }
  // abandoned-family 在 pro 阶段：媒体类事件权重大幅提升（旧事随时可能被曝光）
  if (e.id === 'media-abandoned-family' && player.stage === 'pro' && player.tags.includes('abandoned-family')) w *= 2.5;
  // guilt-spiral 标签：压力类事件权重提升（内疚导致心理更脆弱）
  if (e.type === 'stress' && player.tags.includes('guilt-spiral')) w *= 1.5;
  // 自由人时 tryout 类事件权重提升（申请战队需求）
  if (!player.team && e.type === 'tryout') w *= 1.5;
  // 有战队时 team 类事件权重提升
  if (player.team && e.type === 'team') w *= 1.6;
  if (player.team && e.id.startsWith('team-politics-')) {
    const politics = getClubProfile(player.team.clubId, player.team.tier).politicsBias;
    if (e.requireTags?.includes('team-caller-star-conflict-risk')) {
      w *= politics.conflictRisk * politics.starWeight / Math.max(0.5, politics.coachControl);
    } else if (e.requireTags?.includes('team-star-caller-conflict-risk')) {
      w *= politics.conflictRisk * politics.callerWeight / Math.max(0.5, politics.coachControl);
    } else if (e.requireTags?.includes('team-resource-tilt-risk')) {
      w *= politics.starWeight / Math.max(0.5, politics.coachControl);
    } else if (e.requireTags?.includes('team-positive-voice-risk')) {
      w *= Math.max(0.5, politics.coachControl) / Math.max(0.5, politics.conflictRisk);
    } else if (e.requireTags?.includes('team-ordinary-politics-risk')) {
      w *= politics.conflictRisk;
    }
  }
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
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'demo-review',
        label: '分析对手录像',
        description: '研究对手的战术习惯，寻找可利用的规律。',
        check: { primary: 'intelligence', dc: 8, traitBonuses: { tactical: 2, igl: 1 } },
        success: {
          narrative: '你发现对手在某个点位有固定的战术偏好，这会是关键。',
          effects: {
            buffAdd: {
              id: 'pre-match-intel',
              label: '赛前情报',
              actionTag: 'match',
              growthKey: 'experience',
              growthMultiplier: 1.15,
              remainingUses: 2,
              consumeOn: 'growth',
            },
          },
        },
        failure: {
          narrative: '录像看了两个小时，没找到什么特别的规律。',
          stateDelta: { fatigue: 10 },
        },
      },
      {
        id: 'physical-prep',
        label: '体能保持训练',
        description: '轻量体能练习，保持状态不退步。',
        check: { primary: 'mentality', dc: 5, traitBonuses: { grinder: 1 } },
        success: {
          narrative: '轻量训练到位，身体状态维持得不错。',
          stateDelta: { fatigue: -10, feel: 1 },
        },
        failure: {
          narrative: '练习感觉很干，状态也没起色。',
          stateDelta: { fatigue: 5 },
        },
      },
      {
        id: 'mental-reset',
        label: '心态调整',
        description: '放松放松，不要在比赛前把自己绷死。',
        check: { primary: 'mentality', dc: 4, traitBonuses: { steady: 2 } },
        success: {
          narrative: '脑子里的杂念少了一些，感觉可以专注上场了。',
          stateDelta: { stress: -10, fatigue: -5 },
        },
        failure: {
          narrative: '越想放松越焦虑，最后也没怎么休息到。',
          stateDelta: { stress: 5 },
        },
      },
    ],
  };
}

export function buildInjuryAwareTournamentEvent(pm: PendingMatch): EventDef {
  return {
    id: `tourney-injury-${pm.tournamentId}-${pm.stageIndex}`,
    type: 'match',
    title: `伤病未愈 — ${pm.name}`,
    narrative: `队医建议你继续休养，但 ${pm.name} 第 ${pm.stageIndex + 1} 阶段已经排到本周。你必须决定怎么处理。`,
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 2,
    choices: [
      {
        id: 'play-injured',
        label: '带伤上场',
        description: '硬打比赛，但个人表现和后续恢复都会受影响。',
        check: { primary: 'constitution', secondary: 'mentality', dc: 0 },
        success: { narrative: '' },
        failure: { narrative: '' },
      },
      {
        id: 'reduce-role',
        label: '降低承担',
        description: '有战队时更合理，减少关键位责任，队伍胜率和个人数据都会下降。',
        check: { primary: 'mentality', secondary: 'experience', dc: 0 },
        success: { narrative: '' },
        failure: { narrative: '' },
      },
      {
        id: 'forfeit-injury',
        label: '申请退赛',
        description: '退出当前赛事，保住身体状态，但队伍关系和名气会受影响。',
        check: { primary: 'mentality', dc: 0 },
        success: { narrative: '你选择退赛，把身体恢复放在第一位。赛程不会等你，当前赛事就此结束。' },
        failure: { narrative: '你选择退赛，把身体恢复放在第一位。赛程不会等你，当前赛事就此结束。' },
      },
    ],
  };
}

export function pickEvent(ctx: EventContext): EventDef | null {
  const { player, recentEventIds, rng, aiEvents, aiEventCandidates } = ctx;
  const realTags = new Set(player.tags);
  const synthTags = new Set([...player.tags, ...dynamicTags(player)]);
  const weightedAiCandidates = aiEventCandidates ?? aiEvents?.map((event) => ({ event, weightMultiplier: 1 })) ?? [];
  const candidateAiEvents = weightedAiCandidates.map((candidate) => candidate.event);
  const aiWeightById = new Map(weightedAiCandidates.map((candidate) => [candidate.event.id, candidate.weightMultiplier]));
  const pool = [
    ...getEventRegistry().getAll().filter((event) => event.type !== 'tournament-context'),
    ...candidateAiEvents,
  ];

  // 赛事隔离：阻断晋级事件和随机事件
  if (player.pendingMatch) {
    const isMatchWeek =
      player.pendingMatch.resolveYear === (player.year ?? 1) &&
      player.pendingMatch.resolveWeek === (player.week ?? 1);
    if (isMatchWeek) {
      if ((player.restRounds ?? 0) > 0) {
        return buildInjuryAwareTournamentEvent(player.pendingMatch);
      }
      return getEventById(`tournament-${player.pendingMatch.tournamentId}--${player.pendingMatch.stageIndex}`) ?? null;
    }
    return pickTournamentContextEvent(player, candidateAiEvents);
  }

  if (player.forceNextEvent) {
    const forcedEvent = getEventById(player.forceNextEvent);
    if (forcedEvent) return forcedEvent;
  }

  if ((player.restRounds ?? 0) > 0) {
    const restPool = pool.filter((e) =>
      e.type === 'rest' &&
      e.stages.includes(player.stage) &&
      !recentEventIds.includes(e.id) &&
      !e.requireTags?.some((t) => !synthTags.has(t)) &&
      !e.forbidTags?.some((t) => synthTags.has(t))
    );
    if (restPool.length > 0) return weightedPick(restPool, rng, () => 1);
  }

  // 战队申请到期后必须先给回信，避免申请链路被普通随机事件长期挤掉。
  if (synthTags.has('application-response-ready')) {
    const responseEvent = pool.find(
      (e) =>
        e.id === 'chain-club-response' &&
        e.stages.includes(player.stage) &&
        !e.requireTags?.some((t) => !synthTags.has(t)),
    );
    return responseEvent ?? null;
  }

  if (player.pendingApplication && synthTags.has('club-exception-ready')) {
    const exceptionPool = pool.filter(
      (e) =>
        e.id.startsWith('chain-club-exception-') || e.id === 'chain-club-roster-crisis' || e.id === 'chain-club-local-reference',
    ).filter(
      (e) =>
        e.stages.includes(player.stage) &&
        !recentEventIds.includes(e.id) &&
        !e.requireTags?.some((t) => !synthTags.has(t)) &&
        !e.forbidTags?.some((t) => synthTags.has(t)),
    );
    if (exceptionPool.length > 0) return weightedPick(exceptionPool, rng, (e) => e.weight ?? 1);
  }

  // 家人危机：非赛事期间最高优先级注入；赛事期间由赛事上下文结束后再处理
  if (synthTags.has('needs-family-crisis')) {
    const crisisEvent = pool.find((e) => e.id === 'family-crisis-illness');
    return crisisEvent ?? null;
  }

  // 破产恢复：持续破产且冷却结束时，直接注入家人/朋友救济事件
  if (synthTags.has('needs-bailout') || synthTags.has('needs-team-bailout')) {
    const bailoutPool = pool.filter(
      (e) =>
        e.type === 'bailout' &&
        e.stages.includes(player.stage) &&
        !recentEventIds.includes(e.id) &&
        !e.requireTags?.some((t) => !synthTags.has(t)) &&
        !e.forbidTags?.some((t) => synthTags.has(t)),
    );
    if (bailoutPool.length > 0) return weightedPick(bailoutPool, rng, (e) => stateWeight(e, player));
  }

  // Promotion pending: inject the stage-specific narrative event.
  if (player.promotionPending) {
    const gate = getGate(player.stage);
    if (gate) {
      const ev = PROMOTION_EVENTS.find((e) => e.id === gate.promotionEventId);
      if (ev) return ev;
    }
  }

  // 面试优先：interview-ready 时直接注入对应面试事件，不参与随机池竞争
  // 即使找不到匹配事件也返回 null，确保面试期间不插入任何随机事件
  if (synthTags.has('interview-ready')) {
    const interviewPool = pool.filter(
      (e) =>
        e.requireTags?.includes('interview-ready') &&
        e.stages.includes(player.stage) &&
        !e.requireTags?.some((t) => !synthTags.has(t)) &&
        !e.forbidTags?.some((t) => synthTags.has(t)),
    );
    const interviewEvent = weightedPick(interviewPool, rng, (e) => e.requireTags?.length ?? 1);
    return interviewEvent ?? null;
  }

  if (
    synthTags.has('team-caller-star-conflict-risk') ||
    synthTags.has('team-star-caller-conflict-risk') ||
    (synthTags.has('player-star-caller') && synthTags.has('team-influence-conflict-risk')) ||
    synthTags.has('team-positive-voice-risk') ||
    synthTags.has('team-resource-tilt-risk') ||
    synthTags.has('team-lineup-advice-risk') ||
    synthTags.has('team-ordinary-politics-risk')
  ) {
    const politicsPool = pool.filter(
      (e) =>
        e.id.startsWith('team-politics-') &&
        e.stages.includes(player.stage) &&
        !recentEventIds.includes(e.id) &&
        !e.requireTags?.some((t) => !synthTags.has(t)) &&
        !e.forbidTags?.some((t) => synthTags.has(t)),
    );
    if (politicsPool.length > 0) return weightedPick(politicsPool, rng, (e) => stateWeight(e, player));
  }

  if (synthTags.has('role-transition-eligible')) {
    const roleTransitionStart = pool.find(
      (e) =>
        e.id === 'chain-role-transition-start' &&
        e.stages.includes(player.stage) &&
        !recentEventIds.includes(e.id) &&
        !e.requireTags?.some((t) => !synthTags.has(t)) &&
        !e.forbidTags?.some((t) => synthTags.has(t)),
    );
    if (roleTransitionStart) return roleTransitionStart;
  }

  const eligible = pool.filter((e) => {
    if (e.type === 'rest') return false;
    if (e.type === 'routine') return false; // 日常行动改为行动面板，不再随机出现
    if (!e.stages.includes(player.stage)) return false;
    if (recentEventIds.includes(e.id)) return false;
    if (e.requireTags?.some((t) => !synthTags.has(t))) return false;
    if (e.forbidTags?.some((t) => synthTags.has(t))) return false;
    return true;
  });

  const aiEligible = eligible.filter((e) => aiWeightById.has(e.id));
  if (aiEligible.length > 0 && rng() < 0.6) {
    return weightedPick(aiEligible, rng, (e) => stateWeight(e, player) * (aiWeightById.get(e.id) ?? 1));
  }

  if (eligible.length === 0) {
    const fallback = pool.filter(
      (e) => e.type !== 'rest' && e.type !== 'routine' && e.stages.includes(player.stage),
    );
    if (fallback.length === 0) return null;
    return weightedPick(fallback, rng, (e) => stateWeight(e, player));
  }

  return weightedPick(eligible, rng, (e) => stateWeight(e, player) * (aiWeightById.get(e.id) ?? 1));
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

// Replace {transferTarget} with the specific departing teammate's name.
export function substituteTransferTarget(text: string, name: string): string {
  return text.replace(/\{transferTarget\}/g, name);
}

export function toPublicEvent(
  e: EventDef,
  rivals: Rival[] = [],
  teammates: Teammate[] = [],
  transferTarget?: string,
) {
  const sub = (s: string) => {
    let t = substituteRivals(s, rivals);
    t = substituteTeammates(t, teammates);
    if (transferTarget) t = substituteTransferTarget(t, transferTarget);
    return t;
  };
  const subMaybe = (s?: string) => (typeof s === 'string' ? sub(s) : '');
  return {
    id: e.id,
    type: e.type,
    title: subMaybe(e.title),
    narrative: subMaybe(e.narrative),
    choices: e.choices.map((c) => ({
      id: c.id,
      label: subMaybe(c.label),
      description: subMaybe(c.description),
    })),
  };
}
