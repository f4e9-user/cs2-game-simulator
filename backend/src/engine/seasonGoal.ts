import { getClub } from '../data/clubs.js';
import { clubArchetype } from '../data/clubIdentity.js';
import type {
  ClubRuntimeState,
  ClubSeasonGoal,
  ClubSeasonGoalStatus,
  ClubSeasonGoalType,
  GameSession,
  TournamentTier,
} from '../types.js';
import { computeClubVrsScore } from './worldClubs.js';

const LABELS: Record<ClubSeasonGoalType, string> = {
  'survive-tier': '保住当前级别',
  'reach-a-main': '打进 A 级主赛',
  'reach-s-event': '打进 S 级赛事',
  'major-qualification': '获得 Major 席位',
  'major-playoffs': '打进 Major 深轮',
  'develop-rookie': '培养新人',
  'rebuild-core': '完成重建',
};

const TOLERANCE_MULTIPLIER: Record<string, number> = {
  'capital-project': 1.45,
  'legacy-giant': 1.25,
  'fallen-legacy': 1.15,
  'regional-pride': 1,
  'development-factory': 0.7,
  'scrappy-underdog': 0.65,
};

function goalTypeFor(session: GameSession, clubId: string): ClubSeasonGoalType {
  const club = getClub(clubId);
  const archetype = club ? clubArchetype(club) : undefined;
  if (archetype === 'capital-project') return (club?.tier === 'top' || (session.player.fame ?? 0) >= 35) ? 'major-qualification' : 'reach-s-event';
  if (archetype === 'legacy-giant') return club?.tier === 'top' ? 'major-playoffs' : 'reach-s-event';
  if (archetype === 'development-factory') return club?.tier === 'youth' ? 'develop-rookie' : 'reach-a-main';
  if (archetype === 'fallen-legacy') return 'reach-s-event';
  if (archetype === 'scrappy-underdog') return club?.tier === 'youth' ? 'survive-tier' : 'reach-a-main';
  if (club?.tier === 'top') return 'major-qualification';
  if (club?.tier === 'pro') return 'reach-s-event';
  return 'reach-a-main';
}

function targetTierFor(type: ClubSeasonGoalType): TournamentTier | undefined {
  if (type === 'reach-a-main') return 'a';
  if (type === 'reach-s-event') return 's-class';
  if (type === 'major-qualification' || type === 'major-playoffs') return 'major';
  return undefined;
}

export function generateSeasonGoal(session: GameSession, clubId: string, season: number): ClubSeasonGoal {
  const runtime = session.worldClubs?.runtimeByClubId[clubId];
  const type = goalTypeFor(session, clubId);
  return {
    id: `${clubId}:${season}:${type}`,
    type,
    label: LABELS[type],
    season,
    targetTier: targetTierFor(type),
    minVrsScore: type === 'reach-s-event' ? 100 : type.startsWith('major') ? 160 : undefined,
    status: 'active',
    progress: 0,
    baseline: {
      tierParticipations: { ...(session.player.tierParticipations ?? {}) },
      tierChampionships: { ...(session.player.tierChampionships ?? {}) },
      vrsScore: runtime ? computeClubVrsScore(runtime) : 0,
      startYear: season,
    },
  };
}

function participationDelta(session: GameSession, goal: ClubSeasonGoal, tiers: string[]): number {
  return tiers.reduce((sum, tier) => {
    const current = session.player.tierParticipations?.[tier] ?? 0;
    const baseline = goal.baseline.tierParticipations[tier] ?? 0;
    return sum + Math.max(0, current - baseline);
  }, 0);
}

export function evaluateGoalProgress(
  session: GameSession,
  runtime: ClubRuntimeState,
  goal: ClubSeasonGoal,
): { progress: number; met: boolean; partial: boolean } {
  let progress = goal.progress ?? 0;
  if (goal.type === 'survive-tier') {
    progress = runtime.lastTierChange?.season === goal.season && runtime.lastTierChange.direction === 'relegation' ? 0 : 1;
  } else if (goal.type === 'reach-a-main') {
    progress = participationDelta(session, goal, ['a']) > 0 ? 1 : 0;
  } else if (goal.type === 'reach-s-event') {
    progress = participationDelta(session, goal, ['s-open', 's-closed', 's-class']) > 0 ? 1 : 0;
  } else if (goal.type === 'major-qualification') {
    progress = participationDelta(session, goal, ['major']) > 0 || Object.keys(session.player.qualificationSlots ?? {}).some((slot) => slot.includes('major')) ? 1 : 0;
  } else if (goal.type === 'major-playoffs') {
    const majorRuns = (session.player.tierChampionships?.major ?? 0) - (goal.baseline.tierChampionships.major ?? 0);
    progress = majorRuns > 0 || runtime.recentResults.some((result) => result.tier === 'major' && result.result === 'deep-run') ? 1 : 0;
  } else if (goal.type === 'develop-rookie') {
    progress = runtime.rosterStability >= 55 ? 0.7 : 0.3;
  } else if (goal.type === 'rebuild-core') {
    progress = runtime.coreStatus === 'player-core' || runtime.rebuildCorePlayerId ? 1 : 0.4;
  }
  progress = Math.max(0, Math.min(1, progress));
  return { progress, met: progress >= 1, partial: progress >= 0.5 };
}

export function settleSeasonGoal(
  session: GameSession,
  runtime: ClubRuntimeState,
  goal: ClubSeasonGoal,
): { status: ClubSeasonGoalStatus; patienceDelta: number; rebuildPressureDelta: number } {
  const progress = evaluateGoalProgress(session, runtime, goal).progress;
  const status: ClubSeasonGoalStatus = progress >= 1
    ? 'completed'
    : progress >= 0.5
      ? 'partial'
      : 'failed';
  const club = getClub(runtime.clubId);
  const tolerance = club ? (TOLERANCE_MULTIPLIER[clubArchetype(club)] ?? 1) : 1;
  if (status === 'completed') return { status, patienceDelta: 8, rebuildPressureDelta: -12 };
  if (status === 'partial') return { status, patienceDelta: -6, rebuildPressureDelta: Math.round(10 * tolerance) };
  return { status, patienceDelta: -Math.round(18 * tolerance), rebuildPressureDelta: Math.round(28 * tolerance) };
}
