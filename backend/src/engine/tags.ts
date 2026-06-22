import type { Player } from '../types.js';

export const DEFAULT_TAG_LIFETIME_ROUNDS: Partial<Record<string, number>> = {
  'team-trust': 12,
  'clean-record': 24,
  'dirty-money': 24,
  'banned': 24,
  'cheater': 24,
  'scammed': 24,
  'phished': 24,
  'social-circle': 18,
  'trusted-trader': 18,
  'suspicious-debt': 18,
  'gambling-spiral': 18,
  'fan-favorite': 18,
  'highlight-clip': 18,
  'media-backlash': 18,
  'bad-rep': 18,
  'family-strain': 18,
  'guilt-spiral': 18,
  'guilt-processed': 18,
  'abandoned-family': 18,
  'family-support': 12,
  'injured': 12,
  'minor-injury-risk': 12,
  'injury-warning': 12,
  'injury-limited': 12,
  'forced-rest': 12,
  'broke': 12,
  'veteran': 72,
  'star-player': 72,
  'natural-igl': 24,
  'role-confusion': 12,
  'caller-discipline': 12,
  'caller-star-aligned': 12,
  'star-freedom': 12,
  'team-carries-through-you': 12,
  'shared-calling': 12,
  'star-system-ready': 12,
  'late-round-clarity': 12,
  'coach-neutral': 12,
  'coach-backs-star': 12,
  'coach-lost-control': 12,
  'main-awper': 24,
  'team-focus-firepower': 12,
  'team-focus-tactics': 12,
  'team-focus-defense': 12,
  'team-focus-mental': 12,
  'team-tactical-ready': 12,
  'team-meeting-ready': 12,
  'locker-tension': 8,
  'suppressed-anger': 12,
  'team-conflict': 12,
  'team-positive-voice-cd': 8,
  'team-resource-tilt-cd': 8,
  'team-lineup-advice-cd': 8,
  'team-ordinary-politics-cd': 8,
  'team-politics-cd': 8,
  'team-conflict-cd': 8,
  'club-rejected-notify': 12,
  'application-response-ready': 8,
  'application-path-open-match': 12,
  'application-path-talent': 12,
  'interview-pending': 8,
  'interview-ready': 8,
  'just-joined-team': 4,
  'old-teammate-contact': 36,
  'role-transition-active': 12,
  'role-transition-cd': 24,
  'transfer-ban': 24,
  'loan-default': 24,
  'scouted': 12,
  'promote-offer-cd': 24,
  'rival-scout-cd': 12,
  'poach-cd': 12,
  'trash-talk-cd': 8,
  'contract-cd': 48,
  'old-friend-cd': 24,
  'team-finance-cd': 12,
  'tournament-winner': 72,
  'major-champion': 72,
  'opening-mental-scar': 48,
  'opening-physical-debt': 48,
  'opening-tactical-gap': 48,
  'opening-mechanical-gap': 48,
};

function hasBuff(player: Player, buffId: string): boolean {
  return (player.buffs ?? []).some((buff) => buff.id === buffId);
}

export function refreshTagExpiry(
  tags: string[],
  tagExpiry: Record<string, number>,
  currentRound: number,
  addedTags: string[] = [],
): Record<string, number> {
  const next = { ...tagExpiry };
  const added = new Set(addedTags);
  for (const tag of tags) {
    const duration = DEFAULT_TAG_LIFETIME_ROUNDS[tag];
    if (!duration) continue;
    if (added.has(tag) || next[tag] === undefined) {
      next[tag] = currentRound + duration;
    }
  }
  for (const tag of Object.keys(next)) {
    if (!tags.includes(tag)) delete next[tag];
  }
  return next;
}

export function applyAutomaticTagCleanup(
  player: Player,
  removedTags: string[] = [],
): Player {
  const remove = new Set<string>();
  const addRemove = (tag: string) => {
    if (player.tags.includes(tag)) {
      remove.add(tag);
      if (!removedTags.includes(tag)) removedTags.push(tag);
    }
  };

  if (!player.team || (player.teamTrust ?? 0) < 40) addRemove('team-trust');
  if (!player.team) {
    [
      'locker-tension',
      'suppressed-anger',
      'role-confusion',
      'role-transition-active',
      'role-transition-cd',
      'role-crystallize-cd',
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
    ].forEach(addRemove);
  }
  if ((player.stats.money ?? 0) > 0) addRemove('broke');
  if ((player.restRounds ?? 0) <= 0) addRemove('injured');
  if (!hasBuff(player, 'agent-support')) addRemove('has-agent');
  if (!player.pendingApplication) {
    addRemove('application-response-ready');
    addRemove('application-path-open-match');
    addRemove('application-path-talent');
    addRemove('club-origin-match');
    addRemove('club-origin-regional');
    addRemove('club-origin-mismatch');
    addRemove('club-origin-open');
    addRemove('club-exception-ready');
    addRemove('club-exception-strength');
    addRemove('club-exception-roster');
    addRemove('club-exception-scouted');
    addRemove('club-exception-roster-window');
    addRemove('club-exception-referenced');
  }
  if (!player.roleTransition) addRemove('role-transition-active');

  if (remove.size === 0) return player;
  const tags = player.tags.filter((tag) => !remove.has(tag));
  const tagExpiry = { ...(player.tagExpiry ?? {}) };
  for (const tag of remove) delete tagExpiry[tag];
  return { ...player, tags, tagExpiry };
}
