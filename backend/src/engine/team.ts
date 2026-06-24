import { generateRoster } from '../data/roster.js';
import { getClubProfile } from '../data/clubProfiles.js';
import type {
  ClubPlayer,
  GameSession,
  PendingDeparture,
  Player,
  PlayerTeam,
  RoleOverlap,
  RosterNeed,
  RoundCombo,
  StatKey,
  Teammate,
  TeammateRole,
  TeamActionResult,
  TeamIdentity,
  TeamOffer,
} from '../types.js';
import { TEAMMATE_GROWTH_CAP } from './constants.js';
import { makeRng } from './resolver.js';
import { applyMoneyTransaction } from './money.js';
import { previewClubRuntime } from './worldClubs.js';
import {
  canInfluenceByCalling,
  canInfluenceByStarPower,
  canInfluenceTeamStrategy,
  derivePlayerTeamIdentities,
  deriveTeammateIdentities,
  refreshVisibleTeamIdentities,
} from './teamIdentity.js';
import {
  clampFatigue,
  clampNumber,
  clampStress,
  clampTeamTrust,
  dedupe,
  hashString,
} from './utils.js';
import {
  DEPARTURE_INITIAL_PRESSURE,
  DEPARTURE_PRESSURE_THRESHOLD,
} from './departure.js';
import { assertNoActiveEventSequence } from './phase.js';

function consumeRoundCombos(roundCombos: RoundCombo[], consumedIds: Set<string>): RoundCombo[] {
  return roundCombos
    .map((combo) =>
      consumedIds.has(combo.id)
        ? { ...combo, remainingUses: combo.remainingUses - 1 }
        : combo,
    )
    .filter((combo) => combo.remainingUses > 0);
}

interface TeamActionComboOpen {
  id: string;
  label: string;
  requireSuccess?: boolean;
}

interface TeamActionComboConsume {
  id: string;
  label: string;
  effects: {
    dcDelta?: number;
    fatigueDelta?: number;
    stressDelta?: number;
    trustDelta?: number;
    chemistryDelta?: number;
  };
}

const TEAM_ACTION_COMBO_OPENS: Record<string, TeamActionComboOpen[]> = {
  'team-practice': [
    { id: 'team-practice-link', label: '配合手感延续', requireSuccess: true },
  ],
  'team-meeting': [
    { id: 'team-meeting-ready', label: '战术会议铺垫', requireSuccess: true },
  ],
  'locker-room-talk': [
    { id: 'locker-room-open', label: '更衣室气氛打开', requireSuccess: true },
  ],
};

const TEAM_ACTION_COMBO_CONSUMES: Record<string, TeamActionComboConsume[]> = {
  'team-practice': [
    {
      id: 'locker-room-open',
      label: '更衣室气氛打开',
      effects: { dcDelta: -1, stressDelta: -2, chemistryDelta: 1 },
    },
  ],
  'team-meeting': [
    {
      id: 'team-practice-link',
      label: '配合手感延续',
      effects: { dcDelta: -1, trustDelta: 1, chemistryDelta: 1 },
    },
  ],
  'retain-core-teammate': [
    {
      id: 'locker-room-open',
      label: '更衣室气氛打开',
      effects: { dcDelta: -2, stressDelta: -1 },
    },
  ],
  'team-training-focus': [
    {
      id: 'team-meeting-ready',
      label: '战术会议铺垫',
      effects: { dcDelta: -2, stressDelta: -1 },
    },
  ],
};

function matchingTeamActionCombos(player: Player, actionId: string): TeamActionComboConsume[] {
  const active = new Set((player.roundCombos ?? [])
    .filter((combo) => combo.remainingUses > 0)
    .map((combo) => combo.id));
  return (TEAM_ACTION_COMBO_CONSUMES[actionId] ?? []).filter((combo) => active.has(combo.id));
}

function sumTeamComboEffect(
  combos: TeamActionComboConsume[],
  key: keyof TeamActionComboConsume['effects'],
): number {
  return combos.reduce((sum, combo) => sum + (combo.effects[key] ?? 0), 0);
}

function addOpenedTeamCombos(
  roundCombos: RoundCombo[],
  actionId: string,
  success: boolean,
): RoundCombo[] {
  const out = [...roundCombos];
  const existing = new Set(out.map((combo) => combo.id));
  for (const combo of TEAM_ACTION_COMBO_OPENS[actionId] ?? []) {
    if (combo.requireSuccess && !success) continue;
    if (existing.has(combo.id)) continue;
    out.push({
      id: combo.id,
      label: combo.label,
      sourceActionId: actionId,
      remainingUses: 1,
    });
    existing.add(combo.id);
  }
  return out;
}

function resolveTeamActionCombos(
  player: Player,
  actionId: string,
  success: boolean,
): {
  roundCombos: RoundCombo[];
  triggeredLabels: string[];
  addedLabels: string[];
  consumedCombos: TeamActionComboConsume[];
} {
  const consumedCombos = matchingTeamActionCombos(player, actionId);
  const consumedIds = new Set(consumedCombos.map((combo) => combo.id));
  const consumedRoundCombos = consumeRoundCombos(player.roundCombos ?? [], consumedIds);
  const roundCombos = addOpenedTeamCombos(consumedRoundCombos, actionId, success);
  return {
    roundCombos,
    triggeredLabels: consumedCombos.map((combo) => combo.label),
    addedLabels: roundCombos
      .filter((combo) => !consumedRoundCombos.some((before) => before.id === combo.id))
      .map((combo) => combo.label),
    consumedCombos,
  };
}

const TEAM_ACTION_LIMITS: Record<string, number> = {
  'team-meeting': 1,
  'locker-room-talk': 1,
};
const TEAM_PRACTICE_AP_COST = 55;
const TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT = 1;
const TEAM_MEETING_AP_COST = 30;
const LOCKER_ROOM_TALK_AP_COST = 25;
const RETAIN_CORE_TEAMMATE_AP_COST = 35;
const TEAM_TRAINING_FOCUS_AP_COST = 20;
const TEAM_TRAINING_FOCUS_TAGS = [
  'team-focus-firepower',
  'team-focus-tactics',
  'team-focus-defense',
  'team-focus-mental',
];
type TeamTrainingFocus = 'firepower' | 'tactics' | 'defense' | 'mental';
const TEAM_TRAINING_FOCUS_LABELS: Record<TeamTrainingFocus, string> = {
  firepower: '枪法压迫',
  tactics: '战术执行',
  defense: '防守纪律',
  mental: '心态稳定',
};

function clubPlayerToTeammate(clubPlayer: ClubPlayer, slotIndex: number, fallbackChemistry: number): Teammate {
  return {
    id: `slot-${slotIndex + 1}`,
    name: clubPlayer.name,
    role: clubPlayer.role,
    personality: clubPlayer.personality,
    traits: [...clubPlayer.traits],
    stats: { ...clubPlayer.stats },
    growthSpent: 0,
    chemistry: clampTeammateChemistry(clubPlayer.internalChemistry ?? fallbackChemistry),
  };
}

export function rosterFromClubRuntime(session: GameSession, offer: TeamOffer, rng: () => number): Teammate[] {
  const runtime = previewClubRuntime(session, offer.clubId);
  const fallbackChemistry = runtime.internalChemistry;
  const starters = runtime.fullRoster.filter((clubPlayer) => clubPlayer.status === 'starter');
  const source = (starters.length >= 4 ? starters : runtime.fullRoster).slice(0, 4);
  if (source.length >= 4) {
    return source.map((clubPlayer, index) => clubPlayerToTeammate(clubPlayer, index, fallbackChemistry));
  }
  return generateRoster(offer.tier, rng);
}

export function deriveInitialTeamStatus(
  player: Player,
  offer: TeamOffer,
  hadTeam: boolean,
): Pick<PlayerTeam, 'teamStatus' | 'teamStatusUntilRound'> {
  if (!hadTeam && offer.tier === 'youth') {
    return { teamStatus: 'trial', teamStatusUntilRound: player.round + 8 };
  }
  if (offer.tier === 'semi-pro' && player.stage === 'youth') {
    return { teamStatus: 'trial', teamStatusUntilRound: player.round + 8 };
  }
  if ((offer.tier === 'pro' || offer.tier === 'top') && (player.fame ?? 0) < 50) {
    return { teamStatus: 'rotation', teamStatusUntilRound: player.round + 12 };
  }
  return { teamStatus: 'starter' };
}

export function detectRoleOverlap(player: Player, roster: Teammate[]): RoleOverlap[] {
  const overlaps: RoleOverlap[] = [];
  const playerIdentities = derivePlayerTeamIdentities(player, roster);
  for (const tm of roster) {
    const teammateIdentities = deriveTeammateIdentities(tm, roster);
    for (const identity of playerIdentities) {
      if (teammateIdentities.includes(identity) && (identity === 'caller' || identity === 'star')) {
        overlaps.push({
          kind: 'identity',
          value: identity,
          teammateId: tm.id,
          teammateName: tm.name,
          severity: (tm.chemistry ?? 50) < 40 ? 'high' : 'medium',
        });
      }
    }
    if (player.preferredRole && tm.role === player.preferredRole && (tm.role === 'IGL' || tm.role === 'AWPer')) {
      overlaps.push({
        kind: 'role',
        value: tm.role,
        teammateId: tm.id,
        teammateName: tm.name,
        severity: (tm.chemistry ?? 50) < 45 ? 'high' : 'medium',
      });
    }
  }
  return overlaps.slice(0, 4);
}

export function playerFillsRosterNeed(player: Player, roster: Teammate[], need: RosterNeed): boolean {
  const playerIdentities = derivePlayerTeamIdentities(player, roster);
  if (player.preferredRole && need.neededRoles.includes(player.preferredRole)) return true;
  if (player.activeRole && need.neededRoles.includes(player.activeRole)) return true;
  return need.neededIdentities.some((identity) => playerIdentities.includes(identity));
}

export function deriveJoinMode(
  teamStatus: PlayerTeam['teamStatus'],
  fillsNeed: boolean,
  overlaps: RoleOverlap[],
): PlayerTeam['joinMode'] {
  if (teamStatus === 'trial') return 'trial-sixth';
  if (teamStatus === 'rotation') return 'rotation';
  if (fillsNeed) return 'fill-vacancy';
  return overlaps.length > 0 ? 'replace-starter' : 'fill-vacancy';
}

export function joinReason(need: RosterNeed, fillsNeed: boolean, overlaps: RoleOverlap[], joinMode: PlayerTeam['joinMode']): string {
  if (joinMode === 'trial-sixth') return '教练组先把你放在试训位，需要用训练和低级别赛事证明稳定性';
  if (joinMode === 'rotation') return '你被视为轮换补强，需要和现有首发竞争出场时间';
  if (fillsNeed && need.reasons[0]) return `你被签下是为了补上缺口：${need.reasons[0]}`;
  if (overlaps.length > 0) return `你和现有队友存在位置重叠：${overlaps[0]!.value}`;
  return '你被视为当前阵容的常规补强';
}

function currentClubProfile(player: Player) {
  return player.team ? getClubProfile(player.team.clubId, player.team.tier) : null;
}

function isCurrentMatchWeek(player: Player): boolean {
  const pm = player.pendingMatch;
  return !!pm && pm.resolveYear === (player.year ?? 1) && pm.resolveWeek === (player.week ?? 1);
}

function teamActionRecordCurrent(
  player: Player,
  key: string,
): { year: number; week: number; count: number } | undefined {
  const record = (player.weeklyTeamActions ?? {})[key];
  if (!record) return undefined;
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  return record.year === year && record.week === week ? record : undefined;
}

function weeklyTeamActionCount(player: Player, key: string): number {
  return teamActionRecordCurrent(player, key)?.count ?? 0;
}

function weeklyPracticeTotal(player: Player): number {
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  return Object.entries(player.weeklyTeamActions ?? {})
    .filter(([key, record]) => key.startsWith('practice:') && record.year === year && record.week === week)
    .reduce((sum, [, record]) => sum + record.count, 0);
}

function bumpWeeklyTeamAction(player: Player, key: string): Record<string, { year: number; week: number; count: number }> {
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  const current = teamActionRecordCurrent(player, key);
  return {
    ...(player.weeklyTeamActions ?? {}),
    [key]: { year, week, count: (current?.count ?? 0) + 1 },
  };
}

function recordTeamManagementAction(player: Player, actionId: string): string[] {
  return [
    ...(player.currentWeekRoutineActions ?? []),
    actionId,
  ];
}

function assertTeamActionAvailable(player: Player, apCost: number): void {
  if (!player.team || !player.roster || player.roster.length === 0) {
    throw new Error('当前没有可管理的战队阵容');
  }
  if ((player.restRounds ?? 0) > 0) {
    throw new Error('休养期间不能进行队伍管理');
  }
  if ((player.actionPoints ?? 0) < apCost) throw new Error('行动力不足');
  if (isCurrentMatchWeek(player)) throw new Error('赛事比赛周无法进行队伍管理');
}

function teammateAverage(tm: Teammate): number {
  return (tm.stats.agility + tm.stats.intelligence + tm.stats.mentality + tm.stats.experience) / 4;
}

function primaryStatForRole(role: TeammateRole): keyof Teammate['stats'] {
  if (role === 'IGL' || role === 'Lurker') return 'intelligence';
  if (role === 'Support') return 'mentality';
  return 'agility';
}

function teammatePracticeDisplayLabel(stat: keyof Teammate['stats']): string {
  if (stat === 'agility') return '枪法';
  if (stat === 'intelligence') return '决策';
  if (stat === 'mentality') return '稳定性';
  return '比赛经验';
}

function statBonusForTeamAction(value: number, coefficient = 1.5): number {
  return Math.round(Math.sqrt(Math.max(0, value) * 10) * coefficient);
}

function rollTeamAction(
  player: Player,
  primary: StatKey,
  secondary: StatKey | undefined,
  dc: number,
  seed: string,
): { success: boolean; roll: number; dc: number; naturalRoll: number } {
  const rng = makeRng(hashString(seed));
  const naturalRoll = 1 + Math.floor(rng() * 20);
  const primaryValue = primary === 'money' ? Math.round(player.stats.money / 2) : player.stats[primary];
  const secondaryValue = secondary
    ? secondary === 'money'
      ? Math.round(player.stats.money / 2)
      : player.stats[secondary]
    : 0;
  const roll = naturalRoll + statBonusForTeamAction(primaryValue) + statBonusForTeamAction(secondaryValue, 0.75);
  return { success: naturalRoll === 20 || (naturalRoll !== 1 && roll >= dc), roll, dc, naturalRoll };
}

function applyTeammateGrowth(tm: Teammate, stat: keyof Teammate['stats'], amount: number): Teammate {
  const remaining = Math.max(0, TEAMMATE_GROWTH_CAP - (tm.growthSpent ?? 0));
  if (remaining <= 0 || amount <= 0) return tm;
  const applied = Math.min(amount, remaining);
  return {
    ...tm,
    stats: {
      ...tm.stats,
      [stat]: Math.round((tm.stats[stat] + applied) * 10) / 10,
    },
    growthSpent: Math.round(((tm.growthSpent ?? 0) + applied) * 10) / 10,
  };
}

function clampTeammateChemistry(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function adjustTeammateChemistry(tm: Teammate, delta: number): Teammate {
  return {
    ...tm,
    chemistry: clampTeammateChemistry((tm.chemistry ?? 50) + delta),
  };
}

export function adjustRosterChemistry(roster: Teammate[], delta: number): Teammate[] {
  if (delta === 0) return roster;
  return roster.map((tm) => adjustTeammateChemistry(tm, delta));
}

function teammateHasIdentity(player: Player, teammate: Teammate, identity: TeamIdentity): boolean {
  if (teammate.visibleIdentity === identity) return true;
  return deriveTeammateIdentities(teammate, player.roster ?? []).includes(identity);
}

function findTeammateByIdentity(player: Player, identity: TeamIdentity): Teammate | undefined {
  return (player.roster ?? []).find((tm) => teammateHasIdentity(player, tm, identity));
}

export function applyTargetTeammateChemistryDelta(
  player: Player,
  identity: TeamIdentity | undefined,
  delta: number | undefined,
): { player: Player; passiveEffect?: string } {
  if (!player.roster || !identity || typeof delta !== 'number' || delta === 0) {
    return { player };
  }

  const target = findTeammateByIdentity(player, identity);
  if (!target) return { player };

  return {
    player: {
      ...player,
      roster: player.roster.map((tm) =>
        tm.id === target.id ? adjustTeammateChemistry(tm, delta) : tm,
      ),
    },
    passiveEffect: `${target.name}默契 ${delta > 0 ? '+' : ''}${delta}`,
  };
}

export function teammateIsCore(player: Player, teammate: Teammate): boolean {
  const roster = player.roster ?? [];
  const identities = deriveTeammateIdentities(teammate, roster);
  if (identities.some((identity) => identity === 'star' || identity === 'caller' || identity === 'glue' || identity === 'veteran')) {
    return true;
  }
  const rosterAvg = roster.length > 0
    ? roster.reduce((sum, tm) => sum + teammateAverage(tm), 0) / roster.length
    : 0;
  return teammateAverage(teammate) > rosterAvg;
}

export function settleSalaryOnDeparture(player: Player): number {
  if (!player.salaryTracker || !player.team) return 0;
  const weeksServed = Math.max(0, player.round - player.salaryTracker.lastPayRound);
  const settlement = Math.floor(
    (player.team.monthlySalary * weeksServed) / player.salaryTracker.payCycle,
  );
  if (settlement > 0) {
    applyMoneyTransaction(player, settlement);
  }
  player.salaryTracker = null;
  return settlement;
}

export function applyTeamPractice(
  session: GameSession,
  teammateId: string,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  if (!teammateId) throw new Error('teammateId 必填');
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_PRACTICE_AP_COST);

  const roster = player.roster ?? [];
  const targetIndex = roster.findIndex((tm) => tm.id === teammateId);
  if (targetIndex === -1) throw new Error('未知队友');

  const actionKey = `practice:${teammateId}`;
  if (weeklyPracticeTotal(player) >= TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT) {
    throw new Error(`本周队友加练次数已达上限（${TEAM_PRACTICE_WEEKLY_TOTAL_LIMIT} 次）`);
  }
  if (weeklyTeamActionCount(player, actionKey) >= 1) {
    throw new Error('本周已经和这名队友加练过');
  }

  const target = roster[targetIndex]!;
  const primaryStat = primaryStatForRole(target.role);
  const primaryStatLabel = teammatePracticeDisplayLabel(primaryStat);
  const profile = currentClubProfile(player);
  const teamCombos = matchingTeamActionCombos(player, 'team-practice');
  let dc = 8 + Math.floor(teammateAverage(target) / 4);
  dc += profile?.managementModifiers.teamPracticeDc ?? 0;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');
  const check = rollTeamAction(
    player,
    primaryStat as StatKey,
    'experience',
    dc,
    `${session.id}:team-practice:${player.round}:${player.actionPoints}:${teammateId}`,
  );
  const growthBase = check.success ? 0.4 + Math.min(0.4, Math.max(0, (check.roll - dc) * 0.05)) : 0.1;
  const growth = growthBase * (profile?.managementModifiers.teamPracticeGrowthMultiplier ?? 1);
  const chemistryDelta = (check.success ? 4 : 1) + sumTeamComboEffect(teamCombos, 'chemistryDelta');
  const nextRoster = [...roster];
  nextRoster[targetIndex] = adjustTeammateChemistry(
    applyTeammateGrowth(target, primaryStat, growth),
    chemistryDelta,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = Math.round((check.success ? 12 : 10) * (profile?.managementModifiers.fatigueMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'fatigueDelta');
  const stressDelta = Math.round((check.success ? 4 : 8) * (profile?.managementModifiers.stressMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 0 : target.personality === 'drama' ? -1 : 0)
    + sumTeamComboEffect(teamCombos, 'trustDelta');
  const comboResult = resolveTeamActionCombos(player, 'team-practice', check.success);
  const nextPlayer: Player = {
    ...player,
    roster: nextRoster,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    volatile: {
      ...volatile,
      fatigue: clampFatigue(volatile.fatigue + fatigueDelta),
    },
    actionPoints: (player.actionPoints ?? 0) - TEAM_PRACTICE_AP_COST,
    weeklyTeamActions: bumpWeeklyTeamAction(player, actionKey),
    roundCombos: comboResult.roundCombos,
  };

  return {
    player: nextPlayer,
    result: {
      actionId: 'team-practice',
      label: `和 ${target.name} 加练`,
      teammateId,
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? `你和 ${target.name} 把几个配合细节练顺了，对方的${primaryStatLabel}有了小幅提升。`
        : `你和 ${target.name} 练得有些拧巴，身体消耗不少，真正沉淀下来的东西有限。`,
      effects: [
        check.success ? `${target.name}${primaryStatLabel}小幅提升` : `${target.name}训练收益有限`,
        `${target.name}队友默契 +${chemistryDelta}`,
        profile ? `战队风格修正：${profile.rosterStyle}` : '战队风格修正：无',
        trustDelta < 0 ? '队伍信任小幅下降' : '队伍信任不变',
        `疲劳 +${fatigueDelta}`,
        `压力 +${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyTeamMeeting(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_MEETING_AP_COST);
  const actionKey = 'team-meeting';
  const limit = TEAM_ACTION_LIMITS[actionKey] ?? 1;
  if (weeklyTeamActionCount(player, actionKey) >= limit) {
    throw new Error('本周已经开过战术会议');
  }

  const profile = currentClubProfile(player);
  const teamCombos = matchingTeamActionCombos(player, 'team-meeting');
  let dc = 10 + (profile?.managementModifiers.teamMeetingDc ?? 0);
  if ((player.teamTrust ?? 50) < 30) dc += 2;
  if (player.tags.includes('locker-tension')) dc += 2;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');
  const check = rollTeamAction(
    player,
    'intelligence',
    'mentality',
    dc,
    `${session.id}:team-meeting:${player.round}:${player.actionPoints}`,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = Math.round((check.success ? 6 : 5) * (profile?.managementModifiers.fatigueMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'fatigueDelta');
  const stressDelta = Math.round((check.success ? 3 : 10) * (profile?.managementModifiers.stressMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 4 : -2) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const chemistryDelta = (check.success ? 2 : 0) + sumTeamComboEffect(teamCombos, 'chemistryDelta');
  const nextTags = check.success || player.tags.includes('locker-tension')
    ? player.tags
    : [...player.tags, 'locker-tension'];
  const nextBuffs = check.success
    ? [
        ...(player.buffs ?? []).filter((buff) => buff.id !== 'team-tactical-ready'),
        {
          id: 'team-tactical-ready',
          label: '战术统一',
          actionTag: 'match',
          stressGainMultiplier: 0.9,
          remainingUses: 1,
          consumeOn: 'stress' as const,
        },
      ]
    : player.buffs;
  const comboResult = resolveTeamActionCombos(player, 'team-meeting', check.success);

  const nextPlayer: Player = {
    ...player,
    roster: player.roster ? adjustRosterChemistry(player.roster, chemistryDelta) : player.roster,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    volatile: {
      ...volatile,
      fatigue: clampFatigue(volatile.fatigue + fatigueDelta),
    },
    buffs: nextBuffs,
    tags: nextTags,
    actionPoints: (player.actionPoints ?? 0) - TEAM_MEETING_AP_COST,
    weeklyTeamActions: bumpWeeklyTeamAction(player, actionKey),
    currentWeekRoutineActions: recordTeamManagementAction(player, actionKey),
    roundCombos: comboResult.roundCombos,
  };

  return {
    player: nextPlayer,
    result: {
      actionId: 'team-meeting',
      label: '战术会议',
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? '你把几套默认处理讲清楚了，队友们对下一场的沟通口径更统一。'
        : '会议越开越乱，几个细节没有说清，反而让更衣室气氛更紧。',
      effects: [
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        chemistryDelta > 0 ? `全队队友默契 +${chemistryDelta}` : '队友默契不变',
        profile ? `战队风格修正：${profile.rosterStyle}` : '战队风格修正：无',
        check.success ? '获得增益：战术统一' : '更衣室气氛承压',
        `疲劳 +${fatigueDelta}`,
        `压力 +${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyLockerRoomTalk(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  assertNoActiveEventSequence(session);
  const player = session.player;
  assertTeamActionAvailable(player, LOCKER_ROOM_TALK_AP_COST);
  if (!player.tags.includes('locker-tension') && (player.teamTrust ?? 50) >= 30) {
    throw new Error('当前更衣室没有需要安抚的明显问题');
  }
  const actionKey = 'locker-room-talk';
  const limit = TEAM_ACTION_LIMITS[actionKey] ?? 1;
  if (weeklyTeamActionCount(player, actionKey) >= limit) {
    throw new Error('本周已经安抚过更衣室');
  }

  const roster = player.roster ?? [];
  const profile = currentClubProfile(player);
  const teamCombos = matchingTeamActionCombos(player, 'locker-room-talk');
  let dc = 10 + (profile?.managementModifiers.lockerRoomTalkDc ?? 0);
  if (roster.some((tm) => tm.personality === 'drama')) dc += 2;
  if (roster.some((tm) => tm.personality === 'supportive')) dc -= 1;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');
  const check = rollTeamAction(
    player,
    'mentality',
    'experience',
    dc,
    `${session.id}:locker-room-talk:${player.round}:${player.actionPoints}`,
  );

  const volatile = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };
  const fatigueDelta = Math.round((check.success ? 3 : 0) * (profile?.managementModifiers.fatigueMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'fatigueDelta');
  const stressDelta = Math.round((check.success ? -5 : 10) * (profile?.managementModifiers.stressMultiplier ?? 1))
    + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 5 : -3) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const nextTags = check.success
    ? player.tags.filter((tag) => tag !== 'locker-tension')
    : player.tags;
  const comboResult = resolveTeamActionCombos(player, 'locker-room-talk', check.success);
  const nextPlayer: Player = {
    ...player,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    volatile: {
      ...volatile,
      fatigue: clampFatigue(volatile.fatigue + fatigueDelta),
    },
    tags: nextTags,
    actionPoints: (player.actionPoints ?? 0) - LOCKER_ROOM_TALK_AP_COST,
    weeklyTeamActions: bumpWeeklyTeamAction(player, actionKey),
    currentWeekRoutineActions: recordTeamManagementAction(player, actionKey),
    roundCombos: comboResult.roundCombos,
  };

  return {
    player: nextPlayer,
    result: {
      actionId: 'locker-room-talk',
      label: '安抚更衣室',
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? '你把话题拉回到比赛本身，几个人终于愿意把不满说开。'
        : '你试着缓和气氛，但话没落到点上，更衣室反而更沉默。',
      effects: [
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        check.success ? '移除 locker-tension' : 'locker-tension 保留',
        profile ? `战队风格修正：${profile.rosterStyle}` : '战队风格修正：无',
        fatigueDelta !== 0 ? `疲劳 +${fatigueDelta}` : '疲劳不变',
        `压力 ${stressDelta > 0 ? '+' : ''}${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyRetainCoreTeammate(
  session: GameSession,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  const player = session.player;
  assertTeamActionAvailable(player, RETAIN_CORE_TEAMMATE_AP_COST);

  const departure = player.pendingDeparture;
  if (!departure || !departure.revealed) {
    throw new Error('当前没有已经明确的核心队友离队风险');
  }
  if (departure.retentionAttempted) {
    throw new Error('这次离队风险已经尝试过挽留');
  }
  if (player.round >= departure.departureRound) {
    throw new Error('已经进入离队结算阶段，无法再挽留');
  }

  const roster = player.roster ?? [];
  const target = roster.find((tm) => tm.id === departure.slotId);
  if (!target) throw new Error('离队目标已不在当前阵容中');
  if (!teammateIsCore(player, target)) {
    throw new Error('这名队友暂不属于核心挽留目标');
  }

  const identities = deriveTeammateIdentities(target, roster);
  const teamCombos = matchingTeamActionCombos(player, 'retain-core-teammate');
  let dc = 12;
  if ((player.teamTrust ?? 50) < 30) dc += 2;
  if ((target.chemistry ?? 50) >= 70) dc -= 2;
  if (identities.includes('star')) dc += 1;
  if (identities.includes('glue')) dc -= 1;
  if (identities.includes('problem')) dc += 1;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');

  const check = rollTeamAction(
    player,
    'mentality',
    'experience',
    dc,
    `${session.id}:retain-core-teammate:${player.round}:${player.actionPoints}:${target.id}`,
  );
  const lowTrustFailure = !check.success && (player.teamTrust ?? 50) < 30;
  const bigFailure = !check.success && (check.naturalRoll === 1 || check.roll <= dc - 5 || lowTrustFailure);
  const pressureDelta = check.success ? -18 : bigFailure ? 8 : 4;
  const trustDelta = (check.success ? 1 : -4) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const stressDelta = (check.success ? 4 : 8) + sumTeamComboEffect(teamCombos, 'stressDelta');
  const nextPressure = clampNumber(
    (departure.pressure ?? DEPARTURE_INITIAL_PRESSURE) + pressureDelta,
    0,
    departure.pressureThreshold ?? DEPARTURE_PRESSURE_THRESHOLD,
  );
  const nextDeparture: PendingDeparture = {
    ...departure,
    pressure: nextPressure,
    lockedUntilRound: check.success ? Math.max(departure.lockedUntilRound ?? 0, player.round + 4) : departure.lockedUntilRound,
    departureRound: Math.max(
      player.round + 1,
      departure.departureRound + (check.success ? 4 : bigFailure ? -1 : 0),
    ),
    retentionAttempted: true,
    retentionAttemptRound: player.round,
  };
  const comboResult = resolveTeamActionCombos(player, 'retain-core-teammate', check.success);
  const nextPlayer = refreshVisibleTeamIdentities({
    ...player,
    pendingDeparture: nextDeparture,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    actionPoints: (player.actionPoints ?? 0) - RETAIN_CORE_TEAMMATE_AP_COST,
    roundCombos: comboResult.roundCombos,
  });

  return {
    player: nextPlayer,
    result: {
      actionId: 'retain-core-teammate',
      label: `挽留 ${target.name}`,
      teammateId: target.id,
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? `你和 ${target.name} 把离队的顾虑摊开聊了一次，对方没有立刻改变主意，但愿意再多给这支队一些时间。`
        : bigFailure
          ? `这次谈话没能建立信任，${target.name} 反而更确定自己需要离开。`
          : `你试着挽留 ${target.name}，但对方只给出了模糊回应，离队计划没有变化。`,
      effects: [
        check.success ? '离队时间 +6 回合' : bigFailure ? '离队时间 -2 回合' : '离队时间不变',
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        `压力 +${stressDelta}`,
        '本次离队风险不可再次挽留',
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function applyTeamTrainingFocus(
  session: GameSession,
  focus: string,
): { player: Player; result: TeamActionResult } {
  if (session.status !== 'active') throw new Error('session is not active');
  const player = session.player;
  assertTeamActionAvailable(player, TEAM_TRAINING_FOCUS_AP_COST);
  if (!Object.prototype.hasOwnProperty.call(TEAM_TRAINING_FOCUS_LABELS, focus)) {
    throw new Error('未知训练重点');
  }
  const typedFocus = focus as TeamTrainingFocus;
  const roster = player.roster ?? [];
  if (!canInfluenceTeamStrategy(player, roster)) {
    throw new Error('你还没有足够的队内话语权，教练组只会听取个人反馈');
  }

  const teamCombos = matchingTeamActionCombos(player, 'team-training-focus');
  let dc = 12;
  if ((player.fame ?? 0) >= 100) dc -= 2;
  if (canInfluenceByCalling(player, roster)) dc -= 2;
  if ((player.teamTrust ?? 50) >= 65) dc -= 1;
  if ((player.teamTrust ?? 50) < 35) dc += 2;
  if (player.team?.tier === 'top') dc += 1;
  dc += sumTeamComboEffect(teamCombos, 'dcDelta');

  const check = rollTeamAction(
    player,
    'intelligence',
    'experience',
    dc,
    `${session.id}:team-training-focus:${player.round}:${player.actionPoints}:${typedFocus}`,
  );
  const focusTag = `team-focus-${typedFocus}`;
  const stressDelta = (check.success ? 3 : 6) + sumTeamComboEffect(teamCombos, 'stressDelta');
  const trustDelta = (check.success ? 1 : -1) + sumTeamComboEffect(teamCombos, 'trustDelta');
  const nextTags = check.success
    ? dedupe([...player.tags.filter((tag) => !TEAM_TRAINING_FOCUS_TAGS.includes(tag)), focusTag])
    : player.tags;
  const nextTagExpiry = check.success
    ? { ...(player.tagExpiry ?? {}), [focusTag]: player.round + 4 }
    : player.tagExpiry;
  const comboResult = resolveTeamActionCombos(player, 'team-training-focus', check.success);
  const nextPlayer = refreshVisibleTeamIdentities({
    ...player,
    tags: nextTags,
    tagExpiry: nextTagExpiry,
    teamTrust: clampTeamTrust((player.teamTrust ?? 50) + trustDelta),
    stress: clampStress((player.stress ?? 0) + stressDelta),
    actionPoints: (player.actionPoints ?? 0) - TEAM_TRAINING_FOCUS_AP_COST,
    currentWeekRoutineActions: recordTeamManagementAction(player, `team-training-focus:${typedFocus}`),
    roundCombos: comboResult.roundCombos,
  });

  return {
    player: nextPlayer,
    result: {
      actionId: 'team-training-focus',
      label: `建议训练重点：${TEAM_TRAINING_FOCUS_LABELS[typedFocus]}`,
      success: check.success,
      roll: check.roll,
      dc: check.dc,
      narrative: check.success
        ? `你把复盘材料整理好交给教练组，${TEAM_TRAINING_FOCUS_LABELS[typedFocus]} 成为接下来几周的训练重点。`
        : '教练组听完你的建议后没有立刻采纳，几个人对训练方向仍然有分歧。',
      effects: [
        check.success ? `训练重点：${TEAM_TRAINING_FOCUS_LABELS[typedFocus]}（4 周）` : '训练重点未改变',
        `队伍信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`,
        `压力 +${stressDelta}`,
      ],
      comboTriggeredLabels: comboResult.triggeredLabels,
      comboAddedLabels: comboResult.addedLabels,
    },
  };
}

export function calcTrustRateMultiplier(roster: Teammate[], rng: () => number): number {
  const counts: Record<string, number> = {};
  for (const tm of roster) {
    counts[tm.personality] = (counts[tm.personality] ?? 0) + 1;
  }
  let mult = 1;
  if (counts.strict) mult *= 0.7;
  if (counts.supportive) mult *= 1.3;
  if (counts.drama) mult *= (0.7 + rng() * 0.6);
  return mult;
}
