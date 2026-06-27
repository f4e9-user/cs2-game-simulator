'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';
import type { ClubApplicationSummary, ClubTier, Player, Teammate } from '@/lib/types';

const TIER_LABELS: Record<string, string> = {
  youth: '青训',
  'semi-pro': '二线',
  pro: '职业',
  top: '豪门',
};

const TEAM_IDENTITY_LABELS: Record<string, string> = {
  caller: '队内指挥',
  star: '核心火力',
  veteran: '老资历',
  rookie: '新人',
  glue: '稳定器',
  problem: '冲突风险',
  'star-caller': '明星指挥',
};

const TEAM_STATUS_LABELS: Record<string, string> = {
  starter: '首发',
  trial: '试训',
  rotation: '轮换',
};

const JOIN_MODE_LABELS: Record<string, string> = {
  'replace-starter': '竞争首发',
  'fill-vacancy': '补位首发',
  'trial-sixth': '第六人试训',
  rotation: '轮换补强',
};

const MARKET_TIER_ORDER: Record<ClubTier, number> = {
  youth: 0,
  'semi-pro': 1,
  pro: 2,
  top: 3,
};

type MarketStatus = 'hot' | 'stable' | 'cold';
type MarketSort = 'recommended' | 'salary-desc' | 'salary-asc' | 'tier-desc';

const STORYLINE_LABELS: Record<string, { label: string; detail: string }> = {
  'dark-horse-run': {
    label: '黑马冲刺',
    detail: '这支队伍近期状态和结果明显走高，可能正在进入超预期的上升期。',
  },
  'system-clicking': {
    label: '体系咬合',
    detail: '战术执行和队员之间的协作开始顺起来，整体配合比单点实力更稳定。',
  },
  'star-breakout': {
    label: '明星爆发',
    detail: '队内核心选手进入高光期，个人发挥可能直接抬高整队上限。',
  },
  'chemistry-crisis': {
    label: '化学危机',
    detail: '更衣室或协作出现明显裂缝，队伍短期波动会比较大。',
  },
  'fallen-giant': {
    label: '陨落豪门',
    detail: '纸面实力很强，但近期结果远低于预期，可能正在经历重建或动荡。',
  },
  'promoted-after-breakout-season': {
    label: '爆发后晋级',
    detail: '队伍靠上一阶段的惊艳表现拿到更高舞台机会，后续验证压力会很大。',
  },
};

function rookieEligibility(player: Player): { eligible: boolean; path: 'open-match' | 'talent' | null; hint: string } {
  const tp = player.tierParticipations ?? {};
  const tc = player.tierChampionships ?? {};
  const rookieParticipations = (tp['c'] ?? 0) + (tp['b'] ?? 0);
  const bParticipations = tp['b'] ?? 0;
  const rookieChampionships = (tc['c'] ?? 0) + (tc['b'] ?? 0);
  const hasOpenMatch = rookieParticipations >= 3 && bParticipations >= 1 && rookieChampionships >= 1;
  const hasTalentTrait = player.traits.some((id) => id === 'aim-god');

  if (hasOpenMatch) return { eligible: true, path: 'open-match', hint: '✓ 赛事经历达标' };
  if (hasTalentTrait) return { eligible: true, path: 'talent', hint: '✓ 枪法天才特质达标' };

  const parts: string[] = [];
  if (rookieParticipations < 3) parts.push(`C/B 级赛事参赛 ${rookieParticipations}/3 场`);
  if (bParticipations < 1) parts.push(`B 级赛事参赛 ${bParticipations}/1 场`);
  if (rookieChampionships < 1) parts.push(`C/B 级赛事冠军 ${rookieChampionships}/1 次`);
  return {
    eligible: false,
    path: null,
    hint: `未达标：${parts.join('，')}（或持有枪法天才特质）`,
  };
}

function trustLabel(trust: number): { text: string; tone: 'good' | 'mid' | 'warn' | 'danger' } {
  if (trust >= 65) return { text: '高度信任', tone: 'good' };
  if (trust >= 30) return { text: '正常', tone: 'mid' };
  if (trust >= 15) return { text: '关系紧张', tone: 'warn' };
  return { text: '危机', tone: 'danger' };
}

function statAvg(tm: Pick<Teammate, 'stats'>): number {
  const s = tm.stats;
  return Math.round(((s.agility + s.intelligence + s.mentality + s.experience) / 4) * 10) / 10;
}

function deriveTeamChemistry(roster: Teammate[], teamTrust: number): number {
  if (roster.length === 0) return 0;
  const avgTeammateChemistry = roster.reduce((sum, tm) => sum + (tm.chemistry ?? 50), 0) / roster.length;
  const weighted = avgTeammateChemistry * 0.75 + teamTrust * 0.25;
  const trustPenalty = teamTrust < 25 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(weighted - trustPenalty)));
}

function explainSynergy(player: Player): { bonus: number; factors: Array<{ id: string; label: string; value: number }> } {
  const roster = player.roster ?? [];
  if (roster.length === 0) return { bonus: 0, factors: [] };
  const playerTags = player.traits.flatMap((id) => {
    switch (id) {
      case 'aim-god': return ['aimer', 'mechanical'];
      case 'tactical-mind': return ['igl', 'tactical'];
      case 'ice-cold': return ['clutch', 'steady'];
      case 'grinder': return ['grinder', 'steady'];
      case 'streamer-charm': return ['streamer', 'media'];
      case 'support-soul': return ['support', 'steady'];
      case 'awper-instinct': return ['awper', 'mechanical'];
      case 'scene-kid': return ['streetwise', 'grinder'];
      case 'fragile-star': return ['mechanical', 'media', 'fragile'];
      case 'ranked-warrior': return ['solo', 'mechanical'];
      case 'gambler': return ['risky', 'gambler'];
      case 'hothead': return ['aggressive', 'volatile'];
      case 'arrogant': return ['solo', 'ego'];
      case 'introvert': return ['shy', 'anti-media'];
      default: return [];
    }
  });
  const allTraits = new Set(playerTags);
  for (const tm of roster) {
    for (const tag of tm.traits) allTraits.add(tag);
  }
  const traitCounts: Record<string, number> = {};
  for (const tag of allTraits) {
    let count = playerTags.filter((t) => t === tag).length;
    for (const tm of roster) count += tm.traits.filter((t) => t === tag).length;
    traitCounts[tag] = count;
  }
  const factors: Array<{ id: string; label: string; value: number }> = [];
  if (roster.some((tm) => tm.role === 'IGL') && allTraits.has('tactical')) factors.push({ id: 'igl-tactical', label: 'IGL + 战术特质', value: 2 });
  if (roster.some((tm) => tm.role === 'AWPer') && allTraits.has('aimer')) factors.push({ id: 'awper-aimer', label: 'AWP 位 + 火力特质', value: 1 });
  if ((traitCounts.support ?? 0) >= 2) factors.push({ id: 'support-stack', label: '多名支援型特质', value: 1 });
  if (playerTags.includes('igl') && (traitCounts.support ?? 0) >= 1) factors.push({ id: 'player-igl-support', label: '玩家指挥与支援配合', value: 1 });
  if ((traitCounts.ego ?? 0) >= 2) factors.push({ id: 'ego-clash', label: '多个 ego 特质冲突', value: -2 });
  if ((traitCounts.solo ?? 0) >= 3) factors.push({ id: 'solo-stack', label: '单打倾向过多', value: -1 });
  return { bonus: factors.reduce((sum, factor) => sum + factor.value, 0), factors };
}

function clubMatchesPlayerIdentity(player: Player, club: ClubApplicationSummary): boolean {
  const identity = player.visibleTeamIdentity;
  const needs = club.runtimeSummary?.needs ?? [];
  if (!identity || needs.length === 0) return false;
  if (identity === 'star-caller') {
    return needs.includes('star') || needs.includes('caller') || needs.includes('IGL');
  }
  if (identity === 'star') return needs.includes('star');
  if (identity === 'caller') return needs.includes('caller') || needs.includes('IGL');
  return needs.includes(identity);
}

function clubRecommendationScore(player: Player, club: ClubApplicationSummary): number {
  let score = 0;
  const status = getMarketStatus(club.runtimeSummary);
  if (status === 'hot') score += 30;
  if (clubMatchesPlayerIdentity(player, club)) score += 25;
  if (MARKET_TIER_ORDER[club.tier] >= MARKET_TIER_ORDER[player.team?.tier ?? 'youth']) score += 12;
  if ((player.fame ?? 0) >= (club.requiredFame ?? 0)) score += 6;
  if ((club.runtimeSummary?.clubTrust ?? 0) >= 70) score += 4;
  if ((club.runtimeSummary?.storylines ?? []).length > 0) score += 2;
  return score;
}

function clubCanApply(player: Player, club: ClubApplicationSummary): { eligible: boolean; reason: string | null } {
  const requiredIdx = ['rookie', 'youth', 'second', 'pro', 'retired'].indexOf(player.stage);
  const clubRequiredIdx = ['rookie', 'youth', 'second', 'pro', 'retired'].indexOf(club.requiredStage as Player['stage']);
  const rookieCanApplyToYouth =
    player.stage === 'rookie' && club.requiredStage === 'youth' && rookieEligibility(player).eligible === true;

  if (!rookieCanApplyToYouth && requiredIdx < clubRequiredIdx) {
    return { eligible: false, reason: '阶段未达标' };
  }
  if (club.requiredFame !== undefined && (player.fame ?? 0) < club.requiredFame) {
    return { eligible: false, reason: `名气需达到 ${club.requiredFame}` };
  }
  return { eligible: true, reason: null };
}

function marketSortKey(player: Player, club: ClubApplicationSummary, sort: MarketSort): number {
  switch (sort) {
    case 'salary-desc':
      return -club.baseSalary;
    case 'salary-asc':
      return club.baseSalary;
    case 'tier-desc':
      return -MARKET_TIER_ORDER[club.tier] * 1000 - club.baseSalary;
    case 'recommended':
    default:
      return -clubRecommendationScore(player, club) * 1000 - MARKET_TIER_ORDER[club.tier] * 10 - club.baseSalary;
  }
}

function getMarketStatus(summary?: ClubApplicationSummary['runtimeSummary']): MarketStatus {
  const form = summary?.currentForm ?? 50;
  if (form >= 65) return 'hot';
  if (form < 35) return 'cold';
  return 'stable';
}

function getMarketStatusLabel(status: MarketStatus): string {
  return status === 'hot' ? '火热' : status === 'cold' ? '低迷' : '稳定';
}

function getMarketNeedLabel(need: string): string {
  return {
    star: 'star',
    Support: 'Support',
    IGL: 'IGL',
    caller: 'caller',
    glue: 'glue',
    veteran: 'veteran',
  }[need] ?? need;
}

function getStorylineMeta(storyline: string): { label: string; detail: string } {
  return STORYLINE_LABELS[storyline] ?? {
    label: storyline,
    detail: '队伍当前公开故事线标签。',
  };
}

interface Props {
  sessionId: string;
  player: Player;
  enabled: boolean;
  onPlayerUpdate: (p: Player) => void;
}

export function ClubPanel({ sessionId, player, enabled, onPlayerUpdate }: Props) {
  const apiToken = useGameStore((s) => s.apiToken);
  const [clubs, setClubs] = useState<ClubApplicationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [tab, setTab] = useState<'squad' | 'market'>('squad');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MarketSort>('recommended');
  const [tiers, setTiers] = useState<ClubTier[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<MarketStatus[]>([]);
  const [needs, setNeeds] = useState<string[]>([]);

  useEffect(() => {
    api.listSessionClubs(sessionId)
      .then((res) => setClubs(res.clubs))
      .catch(() => api.listClubs().then((res) => setClubs(res.clubs)).catch(() => {}));
  }, [sessionId]);

  const rookieCheck = player.stage === 'rookie' ? rookieEligibility(player) : null;
  const ap = player.actionPoints ?? 0;
  const isResting = (player.restRounds ?? 0) > 0;
  const hasPendingMatch = player.pendingMatch !== null && player.pendingMatch !== undefined;
  const inMatchWeek = hasPendingMatch
    && player.pendingMatch?.resolveYear === (player.year ?? 1)
    && player.pendingMatch?.resolveWeek === (player.week ?? 1);
  const weeklyTeamActions = player.weeklyTeamActions ?? {};
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const teamActionCount = (key: string) => {
    const record = weeklyTeamActions[key];
    return record?.year === currentYear && record.week === currentWeek ? record.count : 0;
  };
  const synergy = explainSynergy(player);
  const voiceStatus = player.team ? (trustLabel(player.teamTrust ?? 50)) : null;

  const toggleMulti = <T,>(value: T, current: T[], setCurrent: (next: T[]) => void) => {
    setCurrent(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const apply = async (clubId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.applyClub(sessionId, clubId, apiToken ?? undefined);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const leaveTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.leaveTeam(sessionId, apiToken ?? undefined);
      setConfirmLeave(false);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const eligibleClubs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clubs.filter((club) => {
      if (club.isRival) return false;
      if (player.team && club.id === player.team.clubId) return false;
      const status = getMarketStatus(club.runtimeSummary);
      const clubNeeds = club.runtimeSummary?.needs ?? [];
      const textMatch =
        query.length === 0 ||
        club.name.toLowerCase().includes(query) ||
        club.tag.toLowerCase().includes(query) ||
        club.region.toLowerCase().includes(query) ||
        (TIER_LABELS[club.tier] ?? club.tier).toLowerCase().includes(query) ||
        clubNeeds.some((need) => getMarketNeedLabel(need).toLowerCase().includes(query));
      if (!textMatch) return false;
      if (tiers.length > 0 && !tiers.includes(club.tier)) return false;
      if (regions.length > 0 && !regions.includes(club.region)) return false;
      if (statuses.length > 0 && !statuses.includes(status)) return false;
      if (needs.length > 0 && !needs.some((need) => clubNeeds.includes(need))) return false;
      return true;
    }).sort((a, b) => {
      const diff = marketSortKey(player, a, sort) - marketSortKey(player, b, sort);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [clubs, needs, player, regions, search, sort, statuses, tiers]);

  const recommendedClubs = eligibleClubs.filter((club) => clubRecommendationScore(player, club) >= 30);
  const otherClubs = eligibleClubs.filter((club) => !recommendedClubs.includes(club));
  const marketClubs = otherClubs.length > 0 ? otherClubs : eligibleClubs;
  const showRecommendedSection = recommendedClubs.length > 0 && recommendedClubs.length < eligibleClubs.length;

  const canApplyBase = enabled && !isResting && ap >= 25 && !loading && !hasPendingMatch && !player.pendingApplication;

  const renderPlayerCard = () => (
    <div className="roster-card highlight player-card">
      <div className="roster-card-top">
        <span className="roster-role-badge brand">[YOU]</span>
        <span className="roster-card-name">{player.name}</span>
        <span className="roster-card-meta">
          {player.activeRole ?? player.preferredRole ?? 'Support'} · AP {player.actionPoints ?? 0}
        </span>
      </div>
      <div className="roster-card-traits">
        {player.team ? `${player.team.name} [${player.team.tag}]` : '自由身'} · {player.visibleTeamIdentity ? (TEAM_IDENTITY_LABELS[player.visibleTeamIdentity] ?? player.visibleTeamIdentity) : '身份未定'}
      </div>
      <div className="roster-card-bottom">
        <span className="profile-chip gold">当前玩家</span>
        <span className="profile-chip faint">资金 {player.stats.money}K</span>
      </div>
    </div>
  );

  const renderTeammateCard = (tm: Teammate) => {
    return (
      <div key={tm.id} className="roster-card">
        <div className="roster-card-top">
          <span className="roster-role-badge">[{tm.role}]</span>
          <span className="roster-card-name">{tm.name}</span>
          <span className="roster-card-meta">均值 {statAvg(tm)} · 默契 {tm.chemistry ?? 50}</span>
        </div>
        <div className="roster-card-traits">{tm.traits.join(' / ')}</div>
        <div className="roster-card-bottom">
          {tm.visibleIdentity ? (
            <span className="profile-chip faint">{TEAM_IDENTITY_LABELS[tm.visibleIdentity] ?? tm.visibleIdentity}</span>
          ) : (
            <span className="profile-chip faint">身份未定</span>
          )}
        </div>
      </div>
    );
  };

  const renderMarketCard = (club: ClubApplicationSummary) => {
    const application = clubCanApply(player, club);
    const canApply = canApplyBase && application.eligible;
    const status = getMarketStatus(club.runtimeSummary);
    const needsList = club.runtimeSummary?.needs ?? [];
    const stories = club.runtimeSummary?.storylines ?? [];
    const recommended = clubRecommendationScore(player, club) >= 30;
    return (
      <div key={club.id} className={`market-card${recommended ? ' recommended' : ''}`}>
        <div className="market-card-head">
          <div>
            <div className="market-card-title">{club.name} <span className="market-card-tag">[{club.tag}]</span></div>
            <div className="market-card-meta">
              <span className={`market-tier tier-${club.tier}`}>{TIER_LABELS[club.tier] ?? club.tier}</span>
              <span className="market-region">{club.region}</span>
              <span className="market-salary">{club.salaryRange[0]}–{club.salaryRange[1]}K/月</span>
            </div>
          </div>
          <div className="market-card-rank">{recommended ? '推荐' : '候选'}</div>
        </div>
        <div className="market-card-body">
          <div className="market-card-row">
            <span className={`market-status ${status}`}>{getMarketStatusLabel(status)}</span>
            {club.runtimeSummary && <span className="market-hint-text">{club.runtimeSummary.rosterStyle} · {club.runtimeSummary.hint}</span>}
          </div>
          <div className="chip-row">
            {needsList.map((need) => (
              <span key={`${club.id}-need-${need}`} className={`profile-chip ${clubMatchesPlayerIdentity(player, club) ? 'green' : 'faint'}`}>
                招募 {getMarketNeedLabel(need)}
              </span>
            ))}
            {stories.map((storyline) => {
              const story = getStorylineMeta(storyline);
              return (
                <span key={`${club.id}-story-${storyline}`} className="profile-chip gold" title={story.detail}>
                  {story.label}
                </span>
              );
            })}
          </div>
        </div>
        <div className="market-card-foot">
          <div className="market-card-note">
            {club.runtimeSummary?.storylines?.length ? `${club.runtimeSummary.storylines.length} 条故事线` : '无公开故事线'}
          </div>
          <button
            type="button"
            className="ghost-button market-apply-button"
            disabled={!canApply}
            onClick={() => apply(club.id)}
          >
            {!application.eligible ? `未达标${application.reason ? ` · ${application.reason}` : ''}` : ap < 25 ? 'AP 不足' : '发简历 -25 AP'}
          </button>
        </div>
      </div>
    );
  };

  const SquadView = () => (
    <div className="club-section">
      {player.team ? (
        <>
          <div className="team-banner">
            <div className="team-banner-main">
              <div className="team-banner-title">
                {player.team.name} <span className="team-banner-tag">[{player.team.tag}]</span>
              </div>
              <div className="team-banner-subtitle">
                {TIER_LABELS[player.team.tier] ?? player.team.tier} · {player.team.region} · 加入于第 {player.team.joinedRound} 回合
              </div>
            </div>
            <div className="team-banner-income-box">
              <div className="team-banner-salary">+{player.team.monthlySalary}K/月</div>
              <div className="team-banner-pay-cycle">
                {player.salaryTracker
                  ? `距上次发薪 ${player.round - player.salaryTracker.lastPayRound} 回合 · ${player.salaryTracker.payCycle} 回合/次`
                  : '暂无固定发薪周期'}
              </div>
            </div>
          </div>

          {player.team.lastTierChange && (
            <div className={`team-tier-change ${player.team.lastTierChange.direction}`}>
              <div className="team-tier-change-main">
                <span className="team-tier-change-label">本赛季升降级结果</span>
                <strong>{player.team.lastTierChange.summary}</strong>
              </div>
              <div className="team-tier-change-meta">
                S{player.team.lastTierChange.season} · {TIER_LABELS[player.team.lastTierChange.fromTier] ?? player.team.lastTierChange.fromTier}
                {' → '}
                {TIER_LABELS[player.team.lastTierChange.toTier] ?? player.team.lastTierChange.toTier}
                {' · '}合同、参赛路径和战队资格已按新层级重算
              </div>
            </div>
          )}

          <div className="team-info-grid">
            <div className="team-info-row"><span>战队信任度</span><strong>{player.teamTrust ?? 50}/100 · {trustLabel(player.teamTrust ?? 50).text}</strong></div>
            <div className="team-info-row"><span>队内定位</span><strong>{player.visibleTeamIdentity ? TEAM_IDENTITY_LABELS[player.visibleTeamIdentity] ?? player.visibleTeamIdentity : '身份未定'}</strong></div>
            <div className="team-info-row"><span>入队定位</span><strong>{JOIN_MODE_LABELS[player.team.joinMode ?? ''] ?? player.team.joinMode ?? '常规补强'} · {TEAM_STATUS_LABELS[player.team.teamStatus ?? 'starter'] ?? player.team.teamStatus ?? '首发'}</strong></div>
            <div className="team-info-row"><span>队伍默契</span><strong>{player.roster ? `${deriveTeamChemistry(player.roster, player.teamTrust ?? 50)} / 100` : '无阵容'}</strong></div>
            <div className="team-info-row"><span>阵容协同</span><strong className={synergy.bonus > 0 ? 'positive' : synergy.bonus < 0 ? 'negative' : ''}>{synergy.bonus > 0 ? '+' : ''}{synergy.bonus}</strong></div>
            <div className="team-info-row"><span>队内话语权</span><strong>{voiceStatus?.text ?? '未集中'}</strong></div>
          </div>

          {player.team.joinReason && <div className="team-note">{player.team.joinReason}</div>}
          {player.team.roleOverlap && player.team.roleOverlap.length > 0 && (
            <div className="chip-row">
              {player.team.roleOverlap.slice(0, 2).map((overlap, index) => (
                <span key={`${overlap.kind}-${overlap.value}-${overlap.teammateId ?? index}`} className="profile-chip faint">
                  重叠：{String(overlap.value)}{overlap.teammateName ? ` / ${overlap.teammateName}` : ''}
                </span>
              ))}
            </div>
          )}

          <div className="section-block">
            <div className="section-block-title">阵容 roster</div>
            <div className="roster-card-list">
              {renderPlayerCard()}
              {(player.roster ?? []).map((tm) => renderTeammateCard(tm))}
            </div>
          </div>

          {confirmLeave ? (
            <div className="leave-box">
              <div className="muted-text">确认离队？名气 -5，赛事进行中无法离队。</div>
              <div className="button-row">
                <button type="button" className="ghost-button danger-text" onClick={leaveTeam} disabled={loading || hasPendingMatch}>确认离队</button>
                <button type="button" className="ghost-button" onClick={() => setConfirmLeave(false)} disabled={loading}>取消</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="ghost-button danger-text"
              onClick={() => setConfirmLeave(true)}
              disabled={!enabled || isResting || hasPendingMatch}
            >
              {isResting ? '休养中无法离队' : hasPendingMatch ? '赛事中无法离队' : '申请离队'}
            </button>
          )}
        </>
      ) : (
        <div className="empty-team-block">
          <div className="team-banner">
            <div className="team-banner-main">
              <div className="team-banner-title">当前无战队</div>
              <div className="team-banner-subtitle">你可以切到转会市场寻找机会</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const MarketView = () => (
    <div className="market-page">
      <div className="market-toolbar">
        <input
          type="text"
          className="market-search"
          placeholder="搜索队名 / 缩写 / 地区 / 需求"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="market-sort" value={sort} onChange={(e) => setSort(e.target.value as MarketSort)}>
          <option value="recommended">推荐优先</option>
          <option value="salary-desc">薪资 ↓</option>
          <option value="salary-asc">薪资 ↑</option>
          <option value="tier-desc">等级 ↓</option>
        </select>
      </div>

      <div className="filter-group">
        {(['youth', 'semi-pro', 'pro', 'top'] as const).map((tier) => (
          <button key={tier} type="button" className={`filter-chip ${tiers.includes(tier) ? 'active' : ''}`} onClick={() => toggleMulti(tier, tiers, setTiers)}>
            {TIER_LABELS[tier]}
          </button>
        ))}
      </div>
      <div className="filter-group">
        {(['亚太', '欧洲', '北美', '中国', '蒙古', '东南亚', '中东', '南美', 'CIS/东欧', '大洋洲'] as const).map((region) => (
          <button key={region} type="button" className={`filter-chip ${regions.includes(region) ? 'active' : ''}`} onClick={() => toggleMulti(region, regions, setRegions)}>
            {region}
          </button>
        ))}
      </div>
      <div className="filter-group">
        {(['hot', 'stable', 'cold'] as const).map((status) => (
          <button key={status} type="button" className={`filter-chip ${statuses.includes(status) ? 'active' : ''}`} onClick={() => toggleMulti(status, statuses, setStatuses)}>
            {getMarketStatusLabel(status)}
          </button>
        ))}
      </div>
      <div className="filter-group">
        {(['star', 'Support', 'IGL', 'caller', 'glue', 'veteran'] as const).map((need) => (
          <button key={need} type="button" className={`filter-chip ${needs.includes(need) ? 'active' : ''}`} onClick={() => toggleMulti(need, needs, setNeeds)}>
            {need}
          </button>
        ))}
      </div>

      {rookieCheck && (
        <div className={`market-hint ${rookieCheck.eligible ? 'good' : 'warn'}`}>
          {rookieCheck.eligible ? `${rookieCheck.hint} — 可以投简历` : `入队门槛：${rookieCheck.hint}`}
        </div>
      )}

      {showRecommendedSection && (
        <div className="market-section">
          <div className="market-section-title">推荐</div>
          <div className="market-list">{recommendedClubs.map(renderMarketCard)}</div>
        </div>
      )}

      <div className="market-section">
        <div className="market-section-title">转会市场</div>
        <div className="market-list">
          {marketClubs.length > 0 ? marketClubs.map(renderMarketCard) : <div className="panel-empty">暂无战队</div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="club-panel">
      <div className="club-tabs">
        <button type="button" className={`club-tab ${tab === 'squad' ? 'active' : ''}`} onClick={() => setTab('squad')}>
          本队 {player.team ? `[${player.team.tag}]` : ''}
        </button>
        <button type="button" className={`club-tab ${tab === 'market' ? 'active' : ''}`} onClick={() => setTab('market')}>
          转会市场
        </button>
      </div>

      {tab === 'squad' ? <SquadView /> : <MarketView />}

      {error && <div className="panel-error">{error}</div>}
    </div>
  );
}
