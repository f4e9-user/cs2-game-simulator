import type { Player, Stage } from '../types.js';
import { STAGE_ORDER } from './constants.js';

// --- Tournament-based stage gate system ---

export interface TournamentGate {
  from: Stage;
  to: Stage;
  tiers: string[];
  legacyTiers: string[];
  minParticipations: number;
  champTiers: string[];
  legacyChampTiers: string[];
  minChampionships: number;
  /** ID of the promotion narrative event injected when gate conditions are met */
  promotionEventId: string;
}

export const TOURNAMENT_GATES: TournamentGate[] = [
  // rookie → youth is NOT a tournament gate; it requires joining a team
  // via the club application system (respondTeamOffer handles the stage advance).
  {
    from: 'youth',
    to: 'second',
    tiers: ['b'],
    legacyTiers: ['secondary-league', 'development-league'],
    minParticipations: 3,
    champTiers: ['b'],
    legacyChampTiers: ['secondary-league', 'development-league'],
    minChampionships: 1,
    promotionEventId: 'promotion-youth-to-second',
  },
  {
    from: 'second',
    to: 'pro',
    tiers: ['a'],
    legacyTiers: ['development-league', 'tier2'],
    minParticipations: 3,
    champTiers: ['a'],
    legacyChampTiers: ['development-league', 'tier2'],
    minChampionships: 1,
    promotionEventId: 'promotion-second-to-pro',
  },
  // pro is the terminal competitive stage; star/veteran are tags, not stages.
];

export function getGate(from: Stage): TournamentGate | undefined {
  return TOURNAMENT_GATES.find((g) => g.from === from);
}

export interface PromotionCheck {
  canPromote: boolean;
  to?: Stage;
  reasons: string[];
}

function sumTiers(record: Record<string, number>, tiers: string[]): number {
  return tiers.reduce((s, t) => s + (record[t] ?? 0), 0);
}

function sumCompatTiers(
  record: Record<string, number>,
  preferred: string[],
  legacy: string[],
): number {
  const preferredValue = sumTiers(record, preferred);
  return preferredValue > 0 ? preferredValue : sumTiers(record, legacy);
}

const TIER_LABELS: Record<string, string> = {
  b: 'B 级赛事',
  a: 'A 级赛事',
  's-qualifier': 'S 级预选',
  's-main': 'S 级正赛',
  netcafe: '网吧赛',
  city: '城市赛',
  platform: '平台赛',
  'secondary-league': '次级联赛',
  'development-league': '发展联赛',
  tier2: 'Tier2 邀请赛',
  tier1: 'Tier1 邀请赛',
  's-class': 'S 级赛事',
  major: 'Major',
};

function tierLabel(tiers: string[]): string {
  return tiers.map((t) => TIER_LABELS[t] ?? t).join('、');
}

export function checkTournamentPromotion(player: Player): PromotionCheck {
  const idx = STAGE_ORDER.indexOf(player.stage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) {
    return { canPromote: false, reasons: [] };
  }

  const gate = getGate(player.stage);
  if (!gate) {
    // pro is the terminal stage; no further tournament gate exists
    return { canPromote: false, reasons: [] };
  }

  const participations = sumCompatTiers(player.tierParticipations ?? {}, gate.tiers, gate.legacyTiers);
  const championships = sumCompatTiers(player.tierChampionships ?? {}, gate.champTiers, gate.legacyChampTiers);
  const reasons: string[] = [];

  if (participations < gate.minParticipations) {
    reasons.push(
      `参赛场次不足：需在 ${tierLabel(gate.tiers)} 参赛 ≥ ${gate.minParticipations} 场（当前 ${participations} 场）`,
    );
  }
  if (championships < gate.minChampionships) {
    reasons.push(
      `夺冠次数不足：需在 ${tierLabel(gate.champTiers)} 夺冠 ≥ ${gate.minChampionships} 次（当前 ${championships} 次）`,
    );
  }

  const canPromote = reasons.length === 0;
  return {
    canPromote,
    to: canPromote ? gate.to : undefined,
    reasons,
  };
}
