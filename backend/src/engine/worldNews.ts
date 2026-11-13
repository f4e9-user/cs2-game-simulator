import { buildYearTournaments, type Tournament } from '../data/tournaments.js';
import type { Club, GameSession, TransferRecord, WeeklyNewsItem, WorldPlayer } from '../types.js';
import { nowIso } from './utils.js';
import { getClub } from '../data/clubs.js';
import { resolveClubDisplayInfo } from './worldClubs.js';

type DatePoint = { year: number; week: number };

const TIER_ORDER: Record<Tournament['tier'], number> = {
  c: 0,
  b: 1,
  a: 2,
  's-open': 3,
  's-closed': 3,
  's-class': 4,
  major: 5,
};

function addWeeks(year: number, week: number, offset: number): DatePoint {
  let y = year;
  let w = week + offset;
  while (w > 48) {
    w -= 48;
    y += 1;
  }
  while (w < 1) {
    w += 48;
    y -= 1;
  }
  return { year: y, week: w };
}

function dateKey(point: DatePoint): string {
  return `${point.year}:${point.week}`;
}

function sameDate(a: DatePoint, b: DatePoint): boolean {
  return a.year === b.year && a.week === b.week;
}

function currentDate(session: GameSession): DatePoint {
  return {
    year: session.player.year ?? 1,
    week: session.player.week ?? 1,
  };
}

function currentTournamentWindow(tournament: Tournament, year: number): { signup: DatePoint | null; result: DatePoint | null } {
  if (tournament.signupWeeks === 'always') return { signup: null, result: null };
  const signupWeek = tournament.signupWeeks[0];
  if (!signupWeek) return { signup: null, result: null };
  const signup = { year, week: signupWeek };
  const result = addWeeks(year, signupWeek, Math.max(2, tournament.bracket.length));
  return { signup, result };
}

function displayClubName(session: GameSession, clubId: string): string {
  return resolveClubDisplayInfo(session, clubId)?.name ?? clubId;
}

function stageLabel(tournament: Tournament, stageIndex: number): string {
  return tournament.bracket[stageIndex]?.name ?? tournament.bracket[tournament.bracket.length - 1]?.name ?? '赛事阶段';
}

function topVisibleClubs(session: GameSession, count: number): string[] {
  const pool = session.worldClubs?.runtimeByClubId ?? {};
  const entries = Object.values(pool)
    .map((runtime) => ({
      name: displayClubName(session, runtime.clubId),
      score: runtime.vrsScore ?? 0,
      round: runtime.updatedRound ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.round - a.round);
  const out: string[] = [];
  for (const entry of entries) {
    if (!out.includes(entry.name)) out.push(entry.name);
    if (out.length >= count) break;
  }
  return out;
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tournamentAudienceTiers(tournament: Tournament): Array<'youth' | 'semi-pro' | 'pro' | 'top'> {
  switch (tournament.tier) {
    case 'c':
      return ['youth', 'semi-pro', 'pro', 'top'];
    case 'b':
      return ['youth', 'semi-pro', 'pro', 'top'];
    case 'a':
      return ['semi-pro', 'pro', 'top'];
    case 's-open':
    case 's-closed':
      return ['pro', 'top'];
    case 's-class':
      return ['pro', 'top'];
    case 'major':
      return ['top'];
    default:
      return ['pro', 'top'];
  }
}

function focusClubsForTournament(session: GameSession, tournament: Tournament, point: DatePoint, count: number): string[] {
  const pool = session.worldClubs?.runtimeByClubId ?? {};
  const eligible = Object.values(pool)
    .filter((runtime) => {
      const club = getClub(runtime.clubId);
      return club ? tournamentAudienceTiers(tournament).includes(club.tier) : false;
    })
    .sort((a, b) => b.vrsScore - a.vrsScore || b.currentForm - a.currentForm || a.clubId.localeCompare(b.clubId));

  if (eligible.length === 0) return topVisibleClubs(session, count);

  const offset = hashString(`${tournament.id}:${point.year}:${point.week}`) % eligible.length;
  const out: string[] = [];
  for (let i = 0; i < eligible.length && out.length < count; i += 1) {
    const runtime = eligible[(offset + i) % eligible.length]!;
    const name = displayClubName(session, runtime.clubId);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function openingCoverage(tournament: Tournament): boolean {
  return TIER_ORDER[tournament.tier] >= 1;
}

function stageCoverage(tournament: Tournament): boolean {
  return TIER_ORDER[tournament.tier] >= 3;
}

function buildTournamentOpeningNews(
  session: GameSession,
  tournament: Tournament,
  point: DatePoint,
): WeeklyNewsItem[] {
  if (!openingCoverage(tournament)) return [];
  const focusClubs = focusClubsForTournament(session, tournament, point, tournament.tier === 'major' ? 3 : 2);
  const focusText = focusClubs.length > 0 ? `，外界开始盯着 ${focusClubs.join('、')} 的签表位置` : '';
  const isMajor = tournament.tier === 'major';
  const tierText = isMajor ? 'Major' : tournament.tier === 's-class' ? 'S 级正赛' : 'S 级赛事';
  return [{
    id: `world-tournament-open:${tournament.id}:${dateKey(point)}`,
    eventId: `world-tournament-open:${tournament.id}:${dateKey(point)}`,
    type: 'broadcast',
    title: `${point.year} W${point.week} ${tournament.displayName} 开赛`,
    narrative: `${tournament.displayName} ${tierText} 开赛，签表和首轮对阵已经出炉${focusText}。`,
    source: {
      kind: 'world-tournament',
      year: point.year,
      week: point.week,
      tournamentId: tournament.id,
      resultId: `${tournament.id}:open:${point.year}:${point.week}`,
    },
    createdAt: nowIso(),
  }];
}

function buildTournamentStageNews(
  tournament: Tournament,
  point: DatePoint,
  stageIndex: number,
): WeeklyNewsItem[] {
  if (!stageCoverage(tournament)) return [];
  const stageName = stageLabel(tournament, stageIndex);
  const phaseText = stageIndex === 0
    ? `${stageName} 打响`
    : stageIndex >= tournament.bracket.length - 2
      ? `${stageName} 进入关键轮次`
      : `${stageName} 持续推进`;

  return [{
    id: `world-tournament-stage:${tournament.id}:${stageIndex}:${dateKey(point)}`,
    eventId: `world-tournament-stage:${tournament.id}:${stageIndex}:${dateKey(point)}`,
    type: 'broadcast',
    title: `${point.year} W${point.week} ${tournament.displayName} · ${stageName}`,
    narrative: `${tournament.displayName} ${phaseText}，赛场热度继续升高。`,
    source: {
      kind: 'world-tournament',
      year: point.year,
      week: point.week,
      tournamentId: tournament.id,
      resultId: `${tournament.id}:stage:${stageIndex}:${point.year}:${point.week}`,
    },
    createdAt: nowIso(),
  }];
}

function buildTournamentResultNews(
  session: GameSession,
  tournament: Tournament,
  point: DatePoint,
): WeeklyNewsItem[] {
  const snapshots = session.worldClubs?.tournamentSnapshots ?? [];
  const snapshot = snapshots.find((item) => item.tournamentId === tournament.id && item.resultYear === point.year && item.resultWeek === point.week);
  if (!snapshot) return [];

  const champion = displayClubName(session, snapshot.championClubId);
  const runnerUp = displayClubName(session, snapshot.runnerUpClubId);
  const tierLabel = tournament.tier === 'major' ? 'Major' : tournament.tier === 's-class' ? 'S 级正赛' : 'S 级赛事';
  const finalStage = tournament.bracket[tournament.bracket.length - 1]?.name ?? '决赛';
  const items: WeeklyNewsItem[] = [{
    id: `world-tournament-result:${snapshot.id}`,
    eventId: `world-tournament-result:${snapshot.id}`,
    type: 'broadcast',
    title: `${point.year} W${point.week} ${tournament.displayName} 落幕`,
    narrative: `${champion} 在 ${tournament.displayName} 决赛击败 ${runnerUp} 捧杯，${tierLabel} 格局继续变化。`,
    report: {
      kind: 'world-tournament',
      stage: finalStage,
      scoreline: snapshot.finalScore,
      champion,
      runnerUp,
      darkHorse: snapshot.darkHorseClubId ? displayClubName(session, snapshot.darkHorseClubId) : undefined,
      bracketSize: tournament.bracket.length,
      participants: snapshot.participants.map((participant) => ({
        clubId: participant.clubId,
        clubName: displayClubName(session, participant.clubId),
        seed: participant.seed,
        vrsScore: participant.vrsScore,
        power: participant.power,
        form: participant.form,
      })),
    },
    source: {
      kind: 'world-tournament',
      year: point.year,
      week: point.week,
      tournamentId: tournament.id,
      clubId: snapshot.championClubId,
      resultId: snapshot.id,
    },
    createdAt: nowIso(),
  }];

  if (snapshot.darkHorseClubId) {
    const darkHorse = displayClubName(session, snapshot.darkHorseClubId);
    const darkHorseEventId = `world-tournament-dark-horse:${snapshot.id}:${snapshot.darkHorseClubId}`;
    items.push({
      id: darkHorseEventId,
      eventId: darkHorseEventId,
      type: 'broadcast',
      title: `${darkHorse} 打成黑马`,
      narrative: `${darkHorse} 从低种子一路杀到 ${tournament.displayName} 决赛日，成为本周职业圈讨论最多的队伍。`,
      source: {
        kind: 'world-tournament',
        year: point.year,
        week: point.week,
        tournamentId: tournament.id,
        clubId: snapshot.darkHorseClubId,
        resultId: snapshot.id,
      },
      createdAt: nowIso(),
    });
  }

  return items;
}

export function buildWorldTournamentNews(session: GameSession): WeeklyNewsItem[] {
  const items: WeeklyNewsItem[] = [];
  const seen = new Set((session.weeklyNews ?? []).map((item) => item.eventId));
  const current = currentDate(session);
  const years = [Math.max(1, current.year - 1), current.year];

  for (const year of years) {
    for (const tournament of buildYearTournaments(year)) {
      const { signup, result } = currentTournamentWindow(tournament, year);
      if (!signup || !result) continue;

      if (sameDate(current, signup)) {
        const openingItems = buildTournamentOpeningNews(session, tournament, current);
        for (const item of openingItems) {
          if (seen.has(item.eventId) || items.some((x) => x.eventId === item.eventId)) continue;
          items.push(item);
        }
      }

      const totalSpan = Math.max(2, tournament.bracket.length);
      const currentOffset = (current.year - signup.year) * 48 + (current.week - signup.week);
      if (currentOffset >= 1 && currentOffset < totalSpan && TIER_ORDER[tournament.tier] >= 4) {
        const stageIndex = Math.min(tournament.bracket.length - 1, currentOffset - 1);
        const stageItems = buildTournamentStageNews(tournament, current, stageIndex);
        for (const item of stageItems) {
          if (seen.has(item.eventId) || items.some((x) => x.eventId === item.eventId)) continue;
          items.push(item);
        }
      }

      if (sameDate(current, result)) {
        const resultItems = buildTournamentResultNews(session, tournament, current);
        for (const item of resultItems) {
          if (seen.has(item.eventId) || items.some((x) => x.eventId === item.eventId)) continue;
          items.push(item);
        }
      }
    }
  }

  return items;
}

export function buildWorldTransferNewsItem(record: TransferRecord, player: WorldPlayer, toClub: Club, fromClub: Club): WeeklyNewsItem {
  return {
    id: `world-transfer:${record.season}:${record.id}`,
    eventId: `world-transfer:${record.id}`,
    type: 'broadcast',
    title: '世界转会动态',
    narrative: `${toClub.name} 从 ${fromClub.name} 签下 ${player.name}，这笔转会被视为 ${record.summary}。`,
    source: {
      kind: 'world-transfer',
      year: record.season,
      resultId: record.id,
      clubId: toClub.id,
    },
    createdAt: nowIso(),
  };
}

export function buildWorldTransferNews(session: GameSession): WeeklyNewsItem[] {
  const existingIds = new Set((session.weeklyNews ?? []).map((item) => item.eventId));
  const items = (session.transferHistory ?? [])
    .slice(0, 4)
    .map((record) => {
      const fromClub = getClub(record.fromClubId);
      const toClub = getClub(record.toClubId);
      if (!fromClub || !toClub) return null;
      const player: WorldPlayer = {
        id: record.playerId,
        name: record.playerId.split(':').at(-1) ?? record.playerId,
        region: toClub.region,
        age: 24,
        clubId: toClub.id,
        role: 'Entry',
        status: 'starter',
        archetype: 'role-player',
        stats: { agility: 50, constitution: 50, intelligence: 50, mentality: 50, experience: 50 },
        form: 0,
        reputation: 50,
        traits: [],
        personality: 'supportive',
        joinedRound: 0,
      };
      return buildWorldTransferNewsItem(record, player, toClub, fromClub);
    })
    .filter((item): item is WeeklyNewsItem => Boolean(item && !existingIds.has(item.eventId)));
  const seen = new Set([...existingIds, ...items.map((item) => item.eventId)]);
  for (const rumor of (session.transferRumors ?? []).slice(0, 6)) {
    if (rumor.resolved || rumor.credibility === 'low') continue;
    const eventId = `world-transfer-rumor:${rumor.id}`;
    if (seen.has(eventId)) continue;
    const fromClub = getClub(rumor.fromClubId);
    const toClub = getClub(rumor.toClubId);
    if (!fromClub || !toClub) continue;
    items.push({
      id: `${eventId}:${rumor.season}`,
      eventId,
      type: 'broadcast',
      title: '世界转会传闻',
      narrative: `传闻：${toClub.name} 正在关注 ${fromClub.name} 的 ${rumor.playerId.split(':').at(-1) ?? rumor.playerId}。${rumor.reason}`,
      source: {
        kind: 'world-transfer',
        year: rumor.season,
        resultId: rumor.id,
        clubId: toClub.id,
      },
      createdAt: nowIso(),
    });
    seen.add(eventId);
  }
  return items;
}

export function buildWorldNewsSocialPosts(session: GameSession): Array<{ author: string; authorType: 'media'; handle: string; content: string }> {
  const recent = (session.weeklyNews ?? []).slice(-6).reverse();
  const posts: Array<{ author: string; authorType: 'media'; handle: string; content: string }> = [];
  for (const item of recent) {
    if (item.source?.kind !== 'world-tournament' && item.source?.kind !== 'world-club-season' && item.source?.kind !== 'world-transfer') continue;
    const prefix = item.type === 'broadcast' ? '赛事观察' : 'HLTV Brief';
    posts.push({
      author: prefix,
      authorType: 'media',
      handle: prefix === '赛事观察' ? '@tournament_watch' : '@hltv_brief',
      content: `${item.title}｜${item.narrative}`,
    });
    if (posts.length >= 2) break;
  }
  return posts;
}
