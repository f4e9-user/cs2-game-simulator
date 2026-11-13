import type { EventDef, EventTone, Player, RoundPlan, RoundTheme, RoundResult, ThemeGroup } from '../types.js';

const HEAVY_ID_PATTERNS = [
  /^family-crisis/,
  /^bailout-/,
  /^cheat-/,
  /^skin-(scam|gamble|gray)-/,
  /^life-/,
  /injur/i,
  /breaking-down/,
  /broke/i,
];

const TENSE_ID_PATTERNS = [
  /^team-/,
  /^chain-/,
  /^tournament-/,
  /^promotion-/,
  /^tryout-/,
  /^agent-/,
  /^rival-/,
  /^match-/,
  /conflict/,
  /contract/,
  /transfer/,
  /role-transition/,
];

const LIGHT_ID_PATTERNS = [
  /^media-/,
  /^broadcast-/,
  /^daily-/,
  /^training-/,
  /^ranked-/,
  /^rest-/,
  /^routine-/,
  /^stress-/,
];

export function deriveThemeGroup(eventType: EventDef['type']): ThemeGroup {
  switch (eventType) {
    case 'team':
    case 'chains':
    case 'rival':
      return 'team';
    case 'match':
    case 'tournament-context':
    case 'tryout':
    case 'ranked':
      return 'competition';
    case 'life':
    case 'bailout':
    case 'betting':
    case 'cheat':
    case 'skins':
      return 'money-life';
    case 'media':
    case 'broadcast':
    case 'agent':
      return 'media';
    case 'training':
    case 'rest':
    case 'daily':
    case 'stress':
    case 'routine':
      return 'growth';
    default:
      return 'growth';
  }
}

export function deriveThemeFromEvent(event: EventDef): RoundTheme {
  return {
    type: event.type,
    group: deriveThemeGroup(event.type),
    tags: [...new Set(event.requireTags ?? [])],
  };
}

export function deriveToneFromEvent(event: EventDef): EventTone {
  if (event.severity === 'critical') return 'heavy';
  if (event.severity === 'important') return 'tense';
  if (event.severity === 'minor') return 'light';

  const id = event.id.toLowerCase();
  if (HEAVY_ID_PATTERNS.some((pattern) => pattern.test(id))) return 'heavy';
  if (TENSE_ID_PATTERNS.some((pattern) => pattern.test(id))) return 'tense';
  if (LIGHT_ID_PATTERNS.some((pattern) => pattern.test(id))) return 'light';

  switch (event.type) {
    case 'life':
    case 'bailout':
    case 'betting':
    case 'cheat':
    case 'skins':
      return 'heavy';
    case 'team':
    case 'match':
    case 'tryout':
    case 'rival':
    case 'chains':
    case 'tournament-context':
    case 'agent':
      return 'tense';
    default:
      return 'light';
  }
}

export function isHardDecision(event: EventDef): boolean {
  return (event.difficulty ?? 0) >= 2;
}

export function isMajorSingleAnchor(event: EventDef): boolean {
  if (event.severity === 'critical') return true;
  if (event.type === 'match' || event.type === 'tournament-context' || event.type === 'bailout') return true;
  if (event.id === 'family-crisis-illness') return true;
  if (event.id === 'chain-team-fired') return true;
  if (event.id === 'chain-team-conflict') return true;
  if (event.id === 'chain-contract-renewal') return true;
  if (event.id.startsWith('promotion-')) return true;
  if (event.id.startsWith('tourney-')) return true;
  if (event.id.startsWith('chain-club-interview')) return true;
  return false;
}

export function composeRoundPlan(session: { player: Player }, anchor: EventDef | null): RoundPlan | null {
  if (!anchor) return null;
  const theme = deriveThemeFromEvent(anchor);
  const tone = deriveToneFromEvent(anchor);
  const player = session.player;
  const lastRoundEventCount = player.lastRoundEventCount ?? 0;

  let targetCount = 1;
  let archetype: RoundPlan['archetype'] = 'quiet';

  if (isMajorSingleAnchor(anchor)) {
    archetype = 'major-single';
    targetCount = 1;
  } else {
    switch (theme.group) {
      case 'team':
        archetype = 'team-drama';
        targetCount = 2;
        break;
      case 'money-life':
        archetype = 'money';
        targetCount = 2;
        break;
      case 'media':
        archetype = 'media';
        targetCount = 2;
        break;
      case 'competition':
        archetype = 'team-drama';
        targetCount = 2;
        break;
      case 'growth':
      default:
        archetype = 'growth';
        targetCount = 1;
        break;
    }
  }

  const stress = player.stress ?? 0;
  const fatigue = player.volatile?.fatigue ?? 0;
  const pressureSignals =
    (stress >= 60 ? 1 : 0) +
    (stress >= 75 ? 1 : 0) +
    (fatigue >= 70 ? 1 : 0) +
    (fatigue >= 85 ? 1 : 0) +
    ((player.consecutiveLosses ?? 0) >= 2 ? 1 : 0) +
    ((player.pendingDeparture ? 1 : 0) || 0) +
    ((player.pendingFamilyCrisis ? 1 : 0) || 0) +
    ((player.stats.money ?? 0) <= 1 ? 1 : 0);

  if (pressureSignals >= 3) targetCount += 1;
  if (lastRoundEventCount >= 3) targetCount = 1;
  else if (lastRoundEventCount === 2) targetCount = Math.min(targetCount, 2);
  if (stress >= 80 || fatigue >= 85 || player.tags.includes('breaking-down')) {
    targetCount = Math.min(targetCount, 2);
  }

  if (player.restRounds > 0) {
    targetCount = 1;
  }

  targetCount = Math.max(1, Math.min(3, targetCount));

  return {
    archetype,
    theme,
    tone,
    targetCount,
    servedCount: 1,
    servedEventIds: [anchor.id],
    hardDecisionCap: 1,
    servedHardDecisions: isHardDecision(anchor) ? 1 : 0,
  };
}

export function deriveThemeFromState(player: Player): RoundTheme | undefined {
  if (player.pendingMatch) {
    return {
      type: 'match',
      group: 'competition',
      tags: ['pendingMatch'],
    };
  }

  if (
    player.team &&
    (
      player.pendingDeparture ||
      (player.teamTrust ?? 50) < 40 ||
      player.tags.includes('locker-tension') ||
      (player.consecutiveLosses ?? 0) >= 2
    )
  ) {
    return {
      type: 'team',
      group: 'team',
      tags: ['team'],
    };
  }

  if (
    (player.stats.money ?? 0) <= 1 ||
    player.tags.includes('broke') ||
    player.tags.includes('cash-strapped') ||
    player.pendingFamilyCrisis
  ) {
    return {
      type: 'life',
      group: 'money-life',
      tags: ['money'],
    };
  }

  if ((player.fame ?? 0) >= 15 || player.tags.includes('major-broadcast')) {
    return {
      type: 'media',
      group: 'media',
      tags: ['media'],
    };
  }

  if ((player.stress ?? 0) >= 60 || (player.volatile?.fatigue ?? 0) >= 70 || player.restRounds > 0) {
    return {
      type: 'training',
      group: 'growth',
      tags: ['recovery'],
    };
  }

  if (player.team) {
    return {
      type: 'team',
      group: 'team',
      tags: ['team'],
    };
  }

  return undefined;
}

export function deriveRecentThemeGroups(history: RoundResult[], window = 8): ThemeGroup[] {
  return history.slice(-window).map((result) => deriveThemeGroup(result.eventType));
}

export function varietyFit(event: EventDef, recentGroups: ThemeGroup[]): number {
  const group = deriveThemeGroup(event.type);
  const count = recentGroups.filter((recentGroup) => recentGroup === group).length;
  const table = [1.4, 1.0, 0.55, 0.3, 0.12];
  return table[Math.min(count, table.length - 1)] ?? 0.12;
}

export function themeStillValid(theme: RoundTheme | undefined, player: Player): boolean {
  if (!theme) return false;
  switch (theme.group) {
    case 'team':
      return Boolean(player.team);
    case 'competition':
      return Boolean(player.pendingMatch);
    case 'money-life':
      return (player.stats.money ?? 0) <= 1 || player.tags.includes('broke') || player.tags.includes('cash-strapped');
    case 'media':
      return (player.fame ?? 0) >= 15 || player.tags.includes('major-broadcast');
    case 'growth':
      return true;
    default:
      return true;
  }
}

export function reconcileRoundPlan(plan: RoundPlan | undefined, player: Player, result: { endRun?: boolean; resultTier?: string; tagsAdded?: string[] }): RoundPlan | undefined {
  if (!plan) return plan;
  const next = { ...plan, servedEventIds: [...plan.servedEventIds] };
  const resultTags = result.tagsAdded ?? [];

  if (
    result.endRun ||
    player.tags.includes('breaking-down') ||
    resultTags.includes('injured') ||
    (player.restRounds > 0 && player.tags.includes('injured'))
  ) {
    next.targetCount = next.servedCount;
    next.tone = 'light';
    next.theme = deriveThemeFromState(player) ?? next.theme;
    return next;
  }

  if (
    player.stress >= 80 ||
    (player.volatile?.fatigue ?? 0) >= 85 ||
    result.resultTier === 'critical_failure'
  ) {
    next.targetCount = Math.max(next.servedCount, next.targetCount - 1);
    next.tone = 'light';
  }

  if (!themeStillValid(next.theme, player)) {
    next.theme = deriveThemeFromState(player);
  }

  return next;
}

export function markRoundPlanServed(plan: RoundPlan, event: EventDef): RoundPlan {
  return {
    ...plan,
    servedCount: plan.servedCount + 1,
    servedEventIds: [...plan.servedEventIds, event.id],
    servedHardDecisions: plan.servedHardDecisions + (isHardDecision(event) ? 1 : 0),
  };
}

export function roundPlanFit(event: EventDef, plan: RoundPlan | undefined, player: Player, recentGroups: ThemeGroup[] = []): number {
  if (!plan) return 1;
  if (plan.servedEventIds.includes(event.id)) return 0;

  let weight = 1;
  const eventTheme = deriveThemeFromEvent(event);
  const eventTone = deriveToneFromEvent(event);

  if (plan.theme) {
    if (eventTheme.type === plan.theme.type) weight *= 3;
    else if (eventTheme.group === plan.theme.group) weight *= 2;
    else if ((event.requireTags ?? []).some((tag) => plan.theme?.tags.includes(tag))) weight *= 1.5;
    else weight *= 0.35;
  }

  if (plan.tone) {
    if (plan.tone === eventTone) weight *= 1.4;
    else if ((plan.tone === 'heavy' && eventTone === 'light') || (plan.tone === 'light' && eventTone === 'heavy')) {
      weight *= 0.25;
    } else {
      weight *= 0.9;
    }
  }

  if (plan.servedHardDecisions >= plan.hardDecisionCap && isHardDecision(event)) {
    weight *= 0.25;
  }

  weight *= varietyFit(event, recentGroups);

  if ((player.stress ?? 0) >= 80 || (player.volatile?.fatigue ?? 0) >= 85) {
    if ((event.severity ?? 'minor') === 'minor' || event.difficulty <= 1) {
      weight *= 0.2;
    }
  }

  return Math.max(0.05, weight);
}

export function roundPlanCountRemaining(plan: RoundPlan | undefined): number {
  if (!plan) return 0;
  return Math.max(0, plan.targetCount - plan.servedCount);
}
