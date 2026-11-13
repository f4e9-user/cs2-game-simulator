import type { CoreStatKey, Player, RoleProfile, TeammateRole } from '../types.js';
import { applyAgeToStats } from '../engine/age.js';

const ROLE_ORDER: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];

export const ROLE_PROFILES: RoleProfile[] = [
  {
    role: 'IGL',
    label: '指挥',
    primaryStats: ['intelligence', 'mentality', 'experience'],
    secondaryStats: ['agility'],
    preferredTraits: ['tactical', 'igl', 'steady', 'support'],
    riskTraits: ['ego', 'solo', 'impulsive'],
    resultTags: ['caller-discipline', 'shared-calling', 'star-system-ready', 'late-round-clarity'],
    eventThemes: ['calling', 'resource-conflict', 'late-round'],
    matchContributions: {
      primary: '全队节奏和关键回合决策',
      secondary: '队伍稳定性解释',
      risk: '指挥失误会放大整队波动',
    },
    transitionCost: 'high',
  },
  {
    role: 'AWPer',
    label: '狙击手',
    primaryStats: ['agility', 'experience', 'mentality'],
    secondaryStats: ['intelligence'],
    preferredTraits: ['aimer', 'mechanical', 'clutch'],
    riskTraits: ['lazy', 'impulsive'],
    resultTags: ['star-freedom', 'team-carries-through-you', 'role-confusion'],
    eventThemes: ['opening-duel', 'space-taking', 'resource-conflict'],
    matchContributions: {
      primary: '爆发上限和关键击杀',
      secondary: '强点威慑',
      risk: '状态差时拖低队伍上限',
    },
    transitionCost: 'medium-high',
  },
  {
    role: 'Entry',
    label: '突破手',
    primaryStats: ['agility', 'mentality'],
    secondaryStats: ['experience'],
    preferredTraits: ['grinder', 'clutch', 'ego'],
    riskTraits: ['lazy', 'solo'],
    resultTags: ['locker-tension', 'role-confusion', 'team-carries-through-you'],
    eventThemes: ['opening-duel', 'space-taking', 'adaptation'],
    matchContributions: {
      primary: '打开局面和创造主动权',
      secondary: '换血收益',
      risk: '高风险低回报会增加压力',
    },
    transitionCost: 'medium',
  },
  {
    role: 'Support',
    label: '辅助',
    primaryStats: ['mentality', 'intelligence'],
    secondaryStats: ['experience'],
    preferredTraits: ['support', 'selfless', 'steady'],
    riskTraits: ['ego', 'solo'],
    resultTags: ['shared-calling', 'caller-discipline', 'late-round-clarity'],
    eventThemes: ['utility', 'adaptation', 'late-round'],
    matchContributions: {
      primary: '执行稳定和补位容错',
      secondary: '队友协同',
      risk: '职责模糊会压低存在感',
    },
    transitionCost: 'medium',
  },
  {
    role: 'Lurker',
    label: '自由人',
    primaryStats: ['intelligence', 'agility'],
    secondaryStats: ['mentality'],
    preferredTraits: ['solo', 'tactical', 'clutch'],
    riskTraits: ['ego', 'impulsive'],
    resultTags: ['late-round-clarity', 'role-confusion', 'locker-tension'],
    eventThemes: ['late-round', 'space-taking', 'adaptation'],
    matchContributions: {
      primary: '信息差和残局处理',
      secondary: '侧翼拉扯',
      risk: '过度独立会造成节奏脱节',
    },
    transitionCost: 'medium-high',
  },
];

export function getRoleProfile(role: TeammateRole): RoleProfile {
  return ROLE_PROFILES.find((profile) => profile.role === role) ?? ROLE_PROFILES[0]!;
}

export function roleFitScore(player: Player, role: TeammateRole): number {
  const profile = getRoleProfile(role);
  const primaryStatScore = averageStats(player, profile.primaryStats) * 4;
  const secondaryStatScore = averageStats(player, profile.secondaryStats) * 2;
  const traitBonus = profile.preferredTraits.reduce(
    (sum, trait) => sum + (player.traits.includes(trait) ? 6 : 0),
    0,
  );
  const activeRoleExperienceBonus = player.activeRole === role
    ? Math.min(12, Math.floor((player.activeRoleRounds ?? 0) / 4) * 2)
    : 0;
  const teamNeedBonus = teamNeedsRole(player, role) ? 10 : 0;
  const riskPenalty = profile.riskTraits.reduce(
    (sum, trait) => sum + (player.traits.includes(trait) ? 6 : 0),
    0,
  );
  return clampScore(
    primaryStatScore +
      secondaryStatScore +
      traitBonus +
      activeRoleExperienceBonus +
      teamNeedBonus -
      riskPenalty,
  );
}

function averageStats(player: Player, stats: CoreStatKey[]): number {
  if (stats.length === 0) return 0;
  const effectiveStats = applyAgeToStats(player.stats, player.age);
  const total = stats.reduce((sum, stat) => sum + (effectiveStats[stat] ?? 0), 0);
  return total / stats.length;
}

function teamNeedsRole(player: Player, role: TeammateRole): boolean {
  if (!player.team || !player.roster) return false;
  const filled = new Set(player.roster.map((teammate) => teammate.role));
  if (player.activeRole) filled.add(player.activeRole);
  return ROLE_ORDER.includes(role) && !filled.has(role);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
