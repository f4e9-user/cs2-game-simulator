import type { Player, Stage } from '../types.js';
import { STAGE_ORDER, STAGE_PROMOTION_EXPERIENCE } from './constants.js';

// A stage gate is the set of *additional* requirements (beyond raw experience)
// to advance from `from` to the next stage. All conditions are AND'd by default;
// `anyTag` means "any one of the listed tags is enough" (OR-style satisfier).
export interface StageGate {
  from: Stage;
  to: Stage;
  experience?: number;       // override the experience threshold from constants
  fame?: number;             // require fame >= N
  anyTag?: string[];         // require ANY of these tags as a shortcut path
}

export const STAGE_GATES: StageGate[] = [
  {
    from: 'rookie',
    to: 'youth',
    fame: 2,
    anyTag: ['signed-second-team', 'tournament-winner', 'fan-favorite'],
  },
  {
    from: 'youth',
    to: 'second',
    fame: 5,
    anyTag: ['signed-second-team', 'tournament-winner'],
  },
  {
    from: 'second',
    to: 'pro',
    fame: 10,
    anyTag: ['tournament-winner', 'highlight-clip'],
  },
  {
    from: 'pro',
    to: 'star',
    fame: 20,
    anyTag: ['tournament-winner'],
  },
];

export function getGate(from: Stage): StageGate | undefined {
  return STAGE_GATES.find((g) => g.from === from);
}

export interface PromotionCheck {
  canPromote: boolean;
  to?: Stage;
  reasons: string[];   // list of unmet requirements (for UI hints)
}

// Returns whether `player` can naturally advance from their current stage.
// Outcome-driven `stageDelta`/`stageSet` overrides bypass this entirely.
export function checkNaturalPromotion(player: Player): PromotionCheck {
  const idx = STAGE_ORDER.indexOf(player.stage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) {
    return { canPromote: false, reasons: [] };
  }
  // 'star' / 'veteran' don't auto-promote — story-driven only.
  if (player.stage === 'star' || player.stage === 'veteran') {
    return { canPromote: false, reasons: [] };
  }

  const next = STAGE_ORDER[idx + 1] as Stage;
  const reasons: string[] = [];

  const gate = getGate(player.stage);
  const expReq = gate?.experience ?? STAGE_PROMOTION_EXPERIENCE[player.stage];
  if (player.stats.experience < expReq) {
    reasons.push(`经验需要 ≥ ${expReq}（当前 ${player.stats.experience}）`);
  }

  if (gate) {
    const fameOk = gate.fame === undefined || player.fame >= gate.fame;
    const tagShortcut =
      gate.anyTag !== undefined &&
      gate.anyTag.some((t) => player.tags.includes(t));

    // The shortcut tags can substitute for the fame requirement, but
    // experience is always required.
    if (!fameOk && !tagShortcut) {
      const fameMsg =
        gate.fame !== undefined ? `名气需要 ≥ ${gate.fame}（当前 ${player.fame}）` : '';
      const tagMsg =
        gate.anyTag && gate.anyTag.length > 0
          ? `或拥有标签：${gate.anyTag.map((t) => '#' + t).join(' / ')}`
          : '';
      const combined = [fameMsg, tagMsg].filter(Boolean).join(' ');
      if (combined) reasons.push(combined);
    }
  }

  return {
    canPromote: reasons.length === 0,
    to: reasons.length === 0 ? next : undefined,
    reasons,
  };
}
