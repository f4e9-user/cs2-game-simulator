import type { ClubTier, PersonalityTag, Teammate, TeammateRole, TeammateStats } from '../types.js';

// ── 队友名字池（中英混合）──────────────────────────────────────────
const CN_SURNAMES = [
  '李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高',
];
const CN_GIVENS = [
  '大锤', '小飞', '阿杰', '明哥', '老猫', '翔子', '黑豹', '石头',
  '阿豪', '小胖', '铁柱', '闪电', '猴子', '小龙', '大鹏', '阿远',
];
const EN_NICKS = [
  'xX_Doom', 'Rush-B', 'OneTap', 'Flickz', 'SmokeGod', 'ClutchKing',
  'HeadshotHarry', 'DeagleDan', 'AWP_Wiz', 'FragsMcGee', 'SilentScope',
  'FlashBang_Ben', 'MollyMike', 'DropShot', 'WallBangWill',
];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function randomName(rng: () => number): string {
  // 60% 中文名，40% 英文ID
  if (rng() < 0.6) {
    return pick(CN_SURNAMES, rng) + pick(CN_GIVENS, rng);
  }
  return pick(EN_NICKS, rng);
}

// ── 角色 ↔ 候选特质 tag 映射（取自设计文档）─────────────────────
const ROLE_TRAIT_POOL: Record<TeammateRole, string[]> = {
  IGL: ['igl', 'tactical', 'steady', 'support', 'selfless'],
  AWPer: ['aimer', 'mechanical', 'clutch', 'solo'],
  Entry: ['mechanical', 'clutch', 'grinder', 'solo'],
  Support: ['support', 'selfless', 'steady', 'igl'],
  Lurker: ['tactical', 'solo', 'steady', 'clutch'],
};

// 可用角色列表
const ROLES: TeammateRole[] = ['IGL', 'AWPer', 'Entry', 'Support', 'Lurker'];
const PERSONALITIES: PersonalityTag[] = ['strict', 'supportive', 'star', 'grinder', 'drama'];

// ── 属性基础值范围（按俱乐部档位）─────────────────────────────────
const TIER_STAT_RANGE: Record<ClubTier, [number, number]> = {
  youth: [3, 6],
  'semi-pro': [5, 9],
  pro: [8, 13],
  top: [11, 16],
};

function rollStat(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randomStats(tier: ClubTier, rng: () => number): TeammateStats {
  const [lo, hi] = TIER_STAT_RANGE[tier];
  return {
    agility: rollStat(lo, hi, rng),
    intelligence: rollStat(lo, hi, rng),
    mentality: rollStat(lo, hi, rng),
    experience: rollStat(lo, hi, rng),
  };
}

function fisherYates<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickTraits(pool: string[], desired: number, rng: () => number): string[] {
  return fisherYates(pool, rng).slice(0, Math.min(desired, pool.length));
}

// ── 主生成函数 ────────────────────────────────────────────────────
export function generateRoster(
  clubTier: ClubTier,
  rng: () => number = Math.random,
): Teammate[] {
  const roles = fisherYates(ROLES, rng);

  return roles.slice(0, 4).map((role, i): Teammate => {
    const traitCount = 2 + Math.floor(rng() * 2); // 2–3 个
    return {
      id: `slot-${i + 1}`,
      name: randomName(rng),
      role,
      personality: pick(PERSONALITIES, rng),
      traits: pickTraits(ROLE_TRAIT_POOL[role], traitCount, rng),
      stats: randomStats(clubTier, rng),
      growthSpent: 0,
    };
  });
}
