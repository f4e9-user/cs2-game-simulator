import { TRAITS } from '../data/traits.js';
import type {
  Player,
  TeamIdentity,
  TeamIdentityTarget,
  Teammate,
  VisiblePlayerTeamIdentity,
} from '../types.js';

export interface IdentityScore {
  identity: TeamIdentity;
  score: number;
  reasons: string[];
}

const MIN_IDENTITY_SCORE = 4;
const IDENTITY_SWITCH_GAP = 2;

const IDENTITY_PRIORITY: TeamIdentity[] = ['caller', 'star', 'glue', 'problem', 'veteran', 'rookie'];

function teammateAverage(tm: Teammate): number {
  return (tm.stats.agility + tm.stats.intelligence + tm.stats.mentality + tm.stats.experience) / 4;
}

function playerTraitTags(player: Player): string[] {
  return player.traits
    .map((id) => TRAITS.find((trait) => trait.id === id)?.tags ?? [])
    .flat();
}

function addScore(
  scores: Map<TeamIdentity, IdentityScore>,
  identity: TeamIdentity,
  amount: number,
  reason: string,
): void {
  const current = scores.get(identity) ?? { identity, score: 0, reasons: [] };
  current.score += amount;
  current.reasons.push(reason);
  scores.set(identity, current);
}

function rankScores(scores: Iterable<IdentityScore>): IdentityScore[] {
  return [...scores]
    .filter((score) => score.score >= MIN_IDENTITY_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return IDENTITY_PRIORITY.indexOf(a.identity) - IDENTITY_PRIORITY.indexOf(b.identity);
    });
}

export function deriveTeammateIdentityScores(teammate: Teammate, roster: Teammate[]): IdentityScore[] {
  const scores = new Map<TeamIdentity, IdentityScore>();
  const avg = teammateAverage(teammate);
  const rosterAvg = roster.length > 0
    ? roster.reduce((sum, tm) => sum + teammateAverage(tm), 0) / roster.length
    : avg;
  const maxAgility = Math.max(...roster.map((tm) => tm.stats.agility), teammate.stats.agility);
  const maxIntelligence = Math.max(...roster.map((tm) => tm.stats.intelligence), teammate.stats.intelligence);
  const maxExperience = Math.max(...roster.map((tm) => tm.stats.experience), teammate.stats.experience);
  const traits = new Set(teammate.traits);
  const chemistry = teammate.chemistry ?? 50;

  if (teammate.role === 'IGL') addScore(scores, 'caller', 5, 'IGL 角色');
  if (traits.has('igl')) addScore(scores, 'caller', 5, '拥有 igl 特质');
  if (traits.has('tactical') && teammate.stats.intelligence + teammate.stats.experience >= 12) {
    addScore(scores, 'caller', 3, '战术特质和较高智力经验');
  }
  if (teammate.stats.intelligence === maxIntelligence) addScore(scores, 'caller', 2, '队内智力靠前');
  if (teammate.stats.experience === maxExperience) addScore(scores, 'caller', 1, '队内经验靠前');

  if (teammate.personality === 'star' && avg >= rosterAvg) addScore(scores, 'star', 4, '明星型且能力不低于队伍均值');
  if (teammate.stats.agility === maxAgility && teammate.stats.agility >= rosterAvg + 1) {
    addScore(scores, 'star', 4, '队内敏捷突出');
  }
  if (traits.has('aimer') || traits.has('mechanical') || traits.has('clutch')) {
    addScore(scores, 'star', 3, '火力相关特质');
  }
  if (traits.has('ego') && avg >= rosterAvg + 1) addScore(scores, 'star', 2, '强力 ego 核心');

  if (teammate.personality === 'supportive') addScore(scores, 'glue', 4, '支持型个性');
  if (traits.has('support') || traits.has('selfless') || traits.has('steady')) {
    addScore(scores, 'glue', 3, '团队稳定特质');
  }
  if (chemistry >= 65) addScore(scores, 'glue', 2, '队友默契较高');
  if (teammate.stats.mentality >= 8) addScore(scores, 'glue', 1, '心态较高');

  if (teammate.personality === 'drama') addScore(scores, 'problem', 4, '戏剧型个性');
  if (traits.has('ego') || traits.has('solo')) addScore(scores, 'problem', 3, '自我或单打特质');
  if (chemistry <= 25) addScore(scores, 'problem', 3, '队友默契过低');

  if (teammate.stats.experience === maxExperience) addScore(scores, 'veteran', 3, '队内经验最高');
  if (chemistry >= 70) addScore(scores, 'veteran', 2, '长期默契较高');

  if (chemistry <= 35 && teammate.stats.experience <= rosterAvg) addScore(scores, 'rookie', 4, '低默契且经验不足');

  return rankScores(scores.values());
}

export function deriveTeammateIdentities(teammate: Teammate, roster: Teammate[]): TeamIdentity[] {
  return deriveTeammateIdentityScores(teammate, roster).map((score) => score.identity);
}

export function derivePlayerIdentityScores(player: Player, roster: Teammate[]): IdentityScore[] {
  const scores = new Map<TeamIdentity, IdentityScore>();
  const tags = new Set(playerTraitTags(player));
  const rosterAvgAgility = roster.length > 0
    ? roster.reduce((sum, tm) => sum + tm.stats.agility, 0) / roster.length
    : 0;
  const rosterAvgIntExp = roster.length > 0
    ? roster.reduce((sum, tm) => sum + tm.stats.intelligence + tm.stats.experience, 0) / roster.length
    : 0;
  const playerIntExp = player.stats.intelligence + player.stats.experience;

  if (player.activeRole === 'IGL') addScore(scores, 'caller', 5, '当前承担 IGL');
  if (player.preferredRole === 'IGL') addScore(scores, 'caller', 3, '稳定角色是 IGL');
  if (tags.has('igl') || tags.has('tactical')) addScore(scores, 'caller', 3, '玩家有指挥或战术特质');
  if (roster.length > 0 && playerIntExp >= rosterAvgIntExp + 3) addScore(scores, 'caller', 2, '智力经验明显高于队友');

  if (player.tags.includes('star-player')) addScore(scores, 'star', 5, '已有明星选手标签');
  if ((player.fame ?? 0) >= 80) addScore(scores, 'star', 4, '名气达到核心水平');
  const topTitles = (player.tierChampionships?.['s-main'] ?? 0) + (player.tierChampionships?.major ?? 0);
  if (topTitles > 0) addScore(scores, 'star', 4, '拥有顶级冠军履历');
  if (roster.length > 0 && player.stats.agility >= rosterAvgAgility + 2) addScore(scores, 'star', 3, '敏捷明显高于队友');

  return rankScores(scores.values());
}

export function derivePlayerTeamIdentities(player: Player, roster: Teammate[]): TeamIdentity[] {
  return derivePlayerIdentityScores(player, roster).map((score) => score.identity);
}

function targetFromScore(
  type: 'player' | 'teammate',
  id: string,
  label: string,
  score: IdentityScore,
  identities: TeamIdentity[],
): TeamIdentityTarget {
  return {
    type,
    id,
    label,
    score: score.score,
    reasons: score.reasons,
    identities,
  };
}

function findIdentityTarget(player: Player, roster: Teammate[], identity: TeamIdentity): TeamIdentityTarget | null {
  const candidates: TeamIdentityTarget[] = [];
  const playerScores = derivePlayerIdentityScores(player, roster);
  const playerScore = playerScores.find((score) => score.identity === identity);
  if (playerScore) {
    candidates.push(targetFromScore('player', 'player', player.name, playerScore, playerScores.map((score) => score.identity)));
  }

  for (const tm of roster) {
    const scores = deriveTeammateIdentityScores(tm, roster);
    const score = scores.find((item) => item.identity === identity);
    if (!score) continue;
    candidates.push(targetFromScore('teammate', tm.id, tm.name, score, scores.map((item) => item.identity)));
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

export function findTeamCaller(player: Player, roster: Teammate[]): TeamIdentityTarget | null {
  return findIdentityTarget(player, roster, 'caller');
}

export function findTeamStar(player: Player, roster: Teammate[]): TeamIdentityTarget | null {
  return findIdentityTarget(player, roster, 'star');
}

export function canInfluenceByCalling(player: Player, roster: Teammate[]): boolean {
  return derivePlayerTeamIdentities(player, roster).includes('caller');
}

export function canInfluenceByStarPower(player: Player, roster: Teammate[]): boolean {
  return derivePlayerTeamIdentities(player, roster).includes('star');
}

export function canInfluenceTeamStrategy(player: Player, roster: Teammate[]): boolean {
  return canInfluenceByCalling(player, roster) || canInfluenceByStarPower(player, roster);
}

function visibleFromScores(scores: IdentityScore[]): TeamIdentity | undefined {
  return scores[0]?.identity;
}

function visiblePlayerIdentity(scores: IdentityScore[]): VisiblePlayerTeamIdentity | undefined {
  const identities = scores.map((score) => score.identity);
  if (identities.includes('star') && identities.includes('caller')) return 'star-caller';
  return scores[0]?.identity;
}

function shouldSwitchIdentity(
  current: TeamIdentity | undefined,
  next: IdentityScore | undefined,
  currentScore: number,
): boolean {
  if (!next) return current !== undefined;
  if (!current) return true;
  if (current === next.identity) return false;
  return next.score >= currentScore + IDENTITY_SWITCH_GAP;
}

export function refreshVisibleTeamIdentities(player: Player, force = false): Player {
  if (!player.roster || player.roster.length === 0) {
    const cleared = { ...player };
    delete cleared.visibleTeamIdentity;
    delete cleared.teamIdentitySinceRound;
    return cleared;
  }

  const round = player.round ?? 0;
  const roster = player.roster.map((tm) => {
    const scores = deriveTeammateIdentityScores(tm, player.roster ?? []);
    const next = scores[0];
    const currentScore = scores.find((score) => score.identity === tm.visibleIdentity)?.score ?? 0;
    const shouldSwitch = force || shouldSwitchIdentity(tm.visibleIdentity, next, currentScore);
    if (!shouldSwitch) return tm;
    const nextIdentity = visibleFromScores(scores);
    if (!nextIdentity) {
      const cleared = { ...tm };
      delete cleared.visibleIdentity;
      delete cleared.identitySinceRound;
      return cleared;
    }
    return {
      ...tm,
      visibleIdentity: nextIdentity,
      identitySinceRound: round,
    };
  });

  const nextPlayerBase = { ...player, roster };
  const playerScores = derivePlayerIdentityScores(nextPlayerBase, roster);
  const nextIdentity = visiblePlayerIdentity(playerScores);
  const currentIdentity = player.visibleTeamIdentity === 'star-caller'
    ? undefined
    : player.visibleTeamIdentity;
  const currentScore = currentIdentity
    ? playerScores.find((score) => score.identity === currentIdentity)?.score ?? 0
    : 0;
  const topScore = playerScores[0];
  const shouldSwitch = force ||
    player.visibleTeamIdentity === undefined ||
    player.visibleTeamIdentity === 'star-caller' ||
    shouldSwitchIdentity(currentIdentity, topScore, currentScore);

  if (!shouldSwitch) return nextPlayerBase;
  if (!nextIdentity) {
    const cleared = { ...nextPlayerBase };
    delete cleared.visibleTeamIdentity;
    delete cleared.teamIdentitySinceRound;
    return cleared;
  }
  return {
    ...nextPlayerBase,
    visibleTeamIdentity: nextIdentity,
    teamIdentitySinceRound: round,
  };
}
