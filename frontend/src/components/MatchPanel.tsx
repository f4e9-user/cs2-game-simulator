'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';
import type { CareerInsight, PendingMatch, Player, Tournament } from '@/lib/types';
import type { ClubTier } from '@/lib/types';
import {
  describeTournamentMoney,
  describeTournamentExp,
  describeTournamentFame,
  describeTournamentStress,
} from '@/lib/format';

const TIER_LABELS: Record<ClubTier, string> = {
  youth: '青训',
  'semi-pro': '二线',
  pro: '职业',
  top: '豪门',
};

const PROGRESSION_LABELS: Record<string, string> = {
  c: 'C级',
  b: 'B级',
  a: 'A级',
  's-qualifier': 'S级预选',
  's-main': 'S级正赛',
  major: 'Major',
};

const ENTRY_LABELS: Record<string, string> = {
  invite: '直邀',
  open_qualifier: '公开预选',
  closed_qualifier: '封闭预选',
  direct_signup: '公开报名',
};

function slotLabel(slot: string): string {
  const match = /^(iem|blast|pgl)-(open|closed|main)$/.exec(slot);
  if (match) {
    const brand = match[1]!.toUpperCase();
    const phase = match[2]! === 'open'
      ? '公开预选门票'
      : match[2]! === 'closed'
        ? '封闭预选门票'
        : '正赛资格';
    return `${brand}${phase}`;
  }
  switch (slot) {
    case 'b-seed':
      return 'B级种子资格';
    case 'a-open':
      return 'A级公开预选门票';
    case 'a-main':
      return 'A级正赛资格';
    case 's-open':
      return 'S公开预选门票';
    case 's-closed':
      return 'S封闭预选门票';
    case 's-main':
      return 'S正赛资格';
    default:
      return slot;
  }
}

function formatSlots(slots: Record<string, number>): string[] {
  return Object.entries(slots)
    .filter(([, count]) => count > 0)
    .map(([slot, count]) => `${slotLabel(slot)} x${count}`);
}

type PreviewTone = 'up' | 'down' | 'neutral';

interface MatchPreviewItem {
  label: string;
  text: string;
  tone: PreviewTone;
}

const PLAYER_TRAIT_TAGS: Record<string, string[]> = {
  'aim-god': ['aimer', 'mechanical'],
  'tactical-mind': ['igl', 'tactical'],
  'ice-cold': ['clutch', 'steady'],
  grinder: ['grinder', 'steady'],
  'streamer-charm': ['streamer', 'media'],
  'support-soul': ['support', 'steady'],
  'awper-instinct': ['awper', 'mechanical'],
  'scene-kid': ['streetwise', 'grinder'],
  'fragile-star': ['mechanical', 'media', 'fragile'],
  'ranked-warrior': ['solo', 'mechanical'],
  gambler: ['risky', 'gambler'],
  hothead: ['aggressive', 'volatile'],
  arrogant: ['solo', 'ego'],
  introvert: ['shy', 'anti-media'],
};

function calcPreviewSynergy(player: Player): number {
  const roster = player.roster ?? [];
  if (roster.length === 0) return 0;

  const playerTags = player.traits.flatMap((id) => PLAYER_TRAIT_TAGS[id] ?? []);
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

  let bonus = 0;
  if (roster.some((tm) => tm.role === 'IGL') && allTraits.has('tactical')) bonus += 2;
  if (roster.some((tm) => tm.role === 'AWPer') && allTraits.has('aimer')) bonus += 1;
  if ((traitCounts.support ?? 0) >= 2) bonus += 1;
  if (playerTags.includes('igl') && (traitCounts.support ?? 0) >= 1) bonus += 1;
  if ((traitCounts.ego ?? 0) >= 2) bonus -= 2;
  if ((traitCounts.solo ?? 0) >= 3) bonus -= 1;
  return bonus;
}

function deriveTeamChemistry(roster: Player['roster'], teamTrust: number): number {
  if (!roster || roster.length === 0) return 0;
  const avgTeammateChemistry = roster.reduce((sum, tm) => sum + (tm.chemistry ?? 50), 0) / roster.length;
  const weighted = avgTeammateChemistry * 0.75 + teamTrust * 0.25;
  const trustPenalty = teamTrust < 25 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(weighted - trustPenalty)));
}

function teamPowerLabel(player: Player, pendingMatch?: PendingMatch | null): MatchPreviewItem {
  if (!player.team) {
    const tier = pendingMatch?.progressionTier ?? pendingMatch?.tier;
    const text = tier === 'c' || tier === 'b'
      ? '临时队参赛，没有固定阵容加成'
      : '临时队参赛，缺少固定阵容支撑';
    return { label: '队伍', text, tone: 'neutral' };
  }
  const roster = player.roster ?? [];
  if (roster.length === 0) {
    return { label: '队友能力', text: '无固定阵容，队伍容错不足', tone: 'down' };
  }
  const avgAgility = roster.reduce((sum, tm) => sum + tm.stats.agility, 0) / roster.length;
  if (avgAgility >= 14) return { label: '队友能力', text: '火力充足，队伍容错更高', tone: 'up' };
  if (avgAgility >= 10) return { label: '队友能力', text: '阵容强度正常', tone: 'neutral' };
  return { label: '队友能力', text: '火力偏弱，队伍容错有限', tone: 'down' };
}

function keyTeammateChemistryLabel(player: Player): MatchPreviewItem | null {
  const roster = player.roster ?? [];
  if (roster.length === 0) return null;
  const sorted = [...roster].sort((a, b) => (a.chemistry ?? 50) - (b.chemistry ?? 50));
  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;
  if ((lowest.chemistry ?? 50) <= 25) {
    return {
      label: '队友默契',
      text: `你和 ${lowest.name} 配合生疏，相关回合容易断档`,
      tone: 'down',
    };
  }
  if ((highest.chemistry ?? 50) >= 75) {
    return {
      label: '队友默契',
      text: `你和 ${highest.name} 配合熟练，固定配合更顺`,
      tone: 'up',
    };
  }
  return null;
}

function buildMatchPreview(player: Player, pendingMatch?: PendingMatch | null): MatchPreviewItem[] {
  const feel = player.volatile?.feel ?? 0;
  const tilt = player.volatile?.tilt ?? 0;
  const fatigue = player.volatile?.fatigue ?? 0;
  const mentality = player.stats.mentality ?? 0;
  const synergy = calcPreviewSynergy(player);
  const trust = player.teamTrust ?? 50;
  const teamChemistry = deriveTeamChemistry(player.roster, trust);
  const keyChemistry = keyTeammateChemistryLabel(player);

  const items: MatchPreviewItem[] = [];
  if (feel >= 2) items.push({ label: '手感', text: '热手，预计对枪表现上浮', tone: 'up' });
  else if (feel >= 1) items.push({ label: '手感', text: '状态不错，枪法更容易打开', tone: 'up' });
  else if (feel <= -2) items.push({ label: '手感', text: '明显偏冷，正面对枪会吃亏', tone: 'down' });
  else if (feel <= -1) items.push({ label: '手感', text: '略冷，需要靠经验和站位弥补', tone: 'down' });
  else items.push({ label: '手感', text: '正常发挥区间', tone: 'neutral' });

  if (fatigue >= 80) items.push({ label: '疲劳', text: '严重透支，后程表现会明显下降', tone: 'down' });
  else if (fatigue >= 65) items.push({ label: '疲劳', text: '偏高，中后程稳定性有风险', tone: 'down' });
  else if (fatigue <= 25) items.push({ label: '疲劳', text: '体能充足，长图压力较小', tone: 'up' });
  else items.push({ label: '疲劳', text: '可接受，但仍会随比赛消耗上升', tone: 'neutral' });

  if (tilt >= 3) items.push({ label: '心态波动', text: '崩盘风险高，关键回合稳定性下降', tone: 'down' });
  else if (tilt >= 2) items.push({ label: '心态波动', text: '心态不稳，失误惩罚会放大', tone: 'down' });
  else if (tilt === 1) items.push({ label: '心态波动', text: '轻微波动，可控', tone: 'neutral' });
  else items.push({ label: '心态波动', text: '心态稳定', tone: 'up' });

  if (mentality >= 15) items.push({ label: '心态', text: '抗压较强，劣势局更稳', tone: 'up' });
  else if (mentality <= 7) items.push({ label: '心态', text: '抗压偏弱，逆风局容易变形', tone: 'down' });
  else items.push({ label: '心态', text: '抗压表现正常', tone: 'neutral' });

  if (!player.team) {
    items.push(teamPowerLabel(player, pendingMatch));
  }

  if (player.team) {
    items.push(teamPowerLabel(player, pendingMatch));

    if (trust >= 65) items.push({ label: '队伍信任', text: '较高，默契发挥更稳定', tone: 'up' });
    else if (trust <= 15) items.push({ label: '队伍信任', text: '危机，会压低队伍默契发挥', tone: 'down' });
    else if (trust <= 30) items.push({ label: '队伍信任', text: '偏低，队伍容错较差', tone: 'down' });
    else items.push({ label: '队伍信任', text: '一般，是默契发挥的正常环境', tone: 'neutral' });

    if (keyChemistry) {
      items.push(keyChemistry);
    } else if (synergy >= 2) {
      items.push({ label: '团队协同', text: '良好，默认配合更顺', tone: 'up' });
    } else if (synergy <= -1) {
      items.push({ label: '团队协同', text: '存在冲突，沟通和分工会拖累队伍表现', tone: 'down' });
    } else {
      items.push({ label: '团队协同', text: '普通，没有明显队伍修正', tone: 'neutral' });
    }

    if (teamChemistry >= 70) items.push({ label: '队伍默契', text: '熟练，战术执行更稳', tone: 'up' });
    else if (teamChemistry <= 25) items.push({ label: '队伍默契', text: '生疏，关键局配合容易断档', tone: 'down' });
    else items.push({ label: '队伍默契', text: '一般，战术执行没有明显修正', tone: 'neutral' });
  }

  return items;
}

export function PreMatchPreview({
  player,
  pendingMatch,
  title = '赛前状态',
}: {
  player: Player;
  pendingMatch?: PendingMatch | null;
  title?: string;
}) {
  const preview = buildMatchPreview(player, pendingMatch);
  return (
    <div className="pre-match-preview">
      <div className="pre-match-preview-title">{title}</div>
      <div className="pre-match-preview-grid">
        {preview.map((item) => (
          <div key={item.label} className={`pre-match-preview-item ${item.tone}`}>
            <span className="pre-match-preview-label">{item.label}</span>
            <span className="pre-match-preview-text">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Keep in sync with qualificationRewards / qualificationMilestones in tournaments.ts
const QUALIFICATION_OVERVIEW = [
  'C赛：新人公开生态，夺冠可拿 B级种子资格',
  'B赛：公开B赛需 B级种子；青训B赛走战队体系',
  'B赛：夺冠可拿 A级公开预选门票，打通青训到二线入口',
  'A级：A公开预选 -> A正赛 -> 品牌S赛资格',
  'IEM：A赛 -> IEM公开预选 -> IEM正赛 / IEM Major',
  'BLAST：A赛 -> BLAST封闭预选 -> BLAST正赛',
  'PGL：A赛 -> PGL公开预选 -> PGL封闭预选 -> PGL Major',
  'EPL / EWC / FISSURE / StarSeries / CAC：当前仍以直邀和积分为主',
  '预选票跟人走；主赛资格跟队走，离队会失去战队资格',
  '资格门票从获得时起约 48 周内有效，报名消耗后本次赛事不受后续过期影响',
];

function teamReqMet(team: Player['team'], req: ClubTier | null): boolean {
  if (!req) return true;
  if (!team) return false;
  const order: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
  return order.indexOf(team.tier) >= order.indexOf(req);
}

interface Props {
  sessionId: string;
  player: Player;
  insight?: CareerInsight | null;
  onPlayerUpdate: (p: Player) => void;
}

export function MatchPanel({ sessionId, player, insight, onPlayerUpdate }: Props) {
  const apiToken = useGameStore((s) => s.apiToken);
  const leaderboard = useGameStore((s) => s.leaderboard);
  const [open, setOpen] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listTournaments(sessionId)
      .then((res) => {
        if (cancelled) return;
        setOpen(res.open);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sessionId, player.week, player.year, player.stage, player.fame]);

  const signup = async (tournamentId: string) => {
    setBusyId(tournamentId);
    setError(null);
    try {
      const res = await api.signup(sessionId, tournamentId, apiToken ?? undefined);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async () => {
    setBusyId('withdraw');
    setError(null);
    try {
      const res = await api.withdraw(sessionId, apiToken ?? undefined);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  return (
    <div style={{ marginBottom: 6 }}>
      <div className="tourney-section-header">
        <span className="tourney-section-title">
          赛事日历
          <span
            className="tourney-help"
            tabIndex={0}
            aria-label={`赛事资格说明：${QUALIFICATION_OVERVIEW.join('；')}`}
          >
            ?
            <span className="tourney-help-popover" role="tooltip">
              {QUALIFICATION_OVERVIEW.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </span>
        </span>
        <div className="tourney-section-qualifiers">
          {formatSlots(player.qualificationSlots ?? {}).length > 0 && (
            <span className="tourney-qualifier muted">
              个人资格：{formatSlots(player.qualificationSlots ?? {}).join(' · ')}
            </span>
          )}
          {formatSlots(player.teamQualificationSlots ?? {}).length > 0 && (
            <span className="tourney-qualifier highlight">
              战队资格：{formatSlots(player.teamQualificationSlots ?? {}).join(' · ')}
            </span>
          )}
        </div>
      </div>

      {insight?.opportunities && insight.opportunities.length > 0 && (
        <div className="tourney-future-block">
          <div className="tourney-future-title">未来 12 周赛程</div>
          <div className="tourney-future-list">
            {insight.opportunities.slice(0, 12).map((opportunity) => (
              <div key={opportunity.id} className="tourney-future-row">
                <span className="tourney-future-week">第 {opportunity.week} 周</span>
                <span className="tourney-future-tier">{opportunity.tier}</span>
                <span className="tourney-future-name">{opportunity.name}</span>
                <span className={`tourney-future-status ${opportunity.available === false ? 'locked' : 'open'}`}>
                  {opportunity.available === false ? opportunity.status : '可报名'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {player.pendingMatch ? (
        <PendingMatchCard
          pm={player.pendingMatch}
          player={player}
          onWithdraw={withdraw}
          busy={busyId === 'withdraw'}
          confirmWithdraw={confirmWithdraw}
          setConfirmWithdraw={setConfirmWithdraw}
          stage={player.stage}
        />
      ) : loading ? (
        <div style={{ padding: '6px 2px', fontSize: 11, color: 'var(--fg-3)' }}>
          加载中…
        </div>
      ) : open.length === 0 ? (
        <div style={{ padding: '6px 2px', fontSize: 11, color: 'var(--fg-3)' }}>
          本周无可报名赛事
        </div>
      ) : (
        open.map((t) => (
          <TournamentCard
            key={t.id}
            t={t}
            team={player.team}
            playerPoints={leaderboard.find((row) => row.isPlayer)?.points ?? 0}
            qualificationSlots={player.qualificationSlots ?? {}}
            teamQualificationSlots={player.teamQualificationSlots ?? {}}
            onSignup={() => signup(t.id)}
            busy={busyId === t.id}
          />
        ))
      )}

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function PendingMatchCard({
  pm,
  player,
  onWithdraw,
  busy,
  confirmWithdraw,
  setConfirmWithdraw,
  stage,
}: {
  pm: PendingMatch;
  player: Player;
  onWithdraw: () => void;
  busy: boolean;
  confirmWithdraw: boolean;
  setConfirmWithdraw: (v: boolean) => void;
  stage: string;
}) {
  const hasContract = ['second', 'pro'].includes(stage);
  return (
    <div className="pending-match-card">
      <div className="pending-match-name">{pm.displayName ?? pm.name}</div>
      <div className="pending-match-meta">
        Y{pm.resolveYear} W{pm.resolveWeek} · {PROGRESSION_LABELS[pm.progressionTier ?? ''] ?? pm.tier} · {ENTRY_LABELS[pm.entryType ?? ''] ?? '正赛'} · 阶段 {pm.stageIndex + 1}
      </div>
      <PreMatchPreview player={player} pendingMatch={pm} />
      {confirmWithdraw ? (
        <div className="withdraw-confirm">
          <div className="withdraw-warning">弃赛后果：</div>
          <div className="withdraw-penalties">
            <span className="chip chip-down">压力 +25</span>
            <span className="chip chip-down">名气 -10</span>
            {hasContract && <span className="chip chip-down">资金 -30K</span>}
            <span className="chip chip-down">弃赛标记</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              type="button"
              className="ghost-button"
              style={{ fontSize: 10, padding: '2px 8px', flex: 1 }}
              onClick={() => setConfirmWithdraw(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={busy}
              onClick={onWithdraw}
              style={{ fontSize: 10, padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)', flex: 1 }}
            >
              {busy ? '弃赛中…' : '确认弃赛'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="ghost-button"
          disabled={busy}
          onClick={() => setConfirmWithdraw(true)}
          style={{ fontSize: 11, padding: '3px 8px' }}
        >
          弃赛
        </button>
      )}
    </div>
  );
}

function hasQualTicket(
  targets: string[] | undefined,
  qualSlots: Record<string, number>,
  teamSlots: Record<string, number>,
): boolean {
  if (!targets?.length) return false;
  return targets.some((slot) => {
    // check brand-specific slot first, then generic fallback (s-open etc.)
    const slots = [slot];
    const generic = slot.replace(/^(iem|blast|pgl)-/, 's-');
    if (generic !== slot) slots.push(generic);
    return slots.some((s) => (qualSlots[s] ?? 0) > 0 || (teamSlots[s] ?? 0) > 0);
  });
}

function hasRankBypass(team: Player['team'], tournament: Tournament): boolean {
  if (!team || !tournament.directEntryBypass) return false;
  const tierOrder: ClubTier[] = ['youth', 'semi-pro', 'pro', 'top'];
  if (
    tournament.directEntryBypass.minTeamTier &&
    tierOrder.indexOf(team.tier) < tierOrder.indexOf(tournament.directEntryBypass.minTeamTier)
  ) {
    return false;
  }
  return true;
}

function hasRankBypassVrs(team: Player['team'], tournament: Tournament, playerPoints: number): boolean {
  if (!hasRankBypass(team, tournament)) return false;
  if (tournament.directEntryBypass?.minVrsScore !== undefined && playerPoints < tournament.directEntryBypass.minVrsScore) {
    return false;
  }
  return true;
}

function TournamentCard({
  t,
  team,
  playerPoints,
  qualificationSlots,
  teamQualificationSlots,
  onSignup,
  busy,
}: {
  t: Tournament;
  team: Player['team'];
  playerPoints: number;
  qualificationSlots: Record<string, number>;
  teamQualificationSlots: Record<string, number>;
  onSignup: () => void;
  busy: boolean;
}) {
  const r = t.reward;
  const teamReq = t.teamRequirement ?? null;
  const needsTicket = !!t.qualificationTargets?.length;
  const hasTicket = hasQualTicket(t.qualificationTargets, qualificationSlots, teamQualificationSlots);
  const rankBypass = hasRankBypassVrs(team, t, playerPoints);
  const teamOk = teamReqMet(team, teamReq) || (teamReq !== null && rankBypass);
  const canEnter = teamOk && (!needsTicket || hasTicket || rankBypass);
  const entryLabel = t.entryType === 'direct_signup' && teamReq
    ? '战队报名'
    : ENTRY_LABELS[t.entryType] ?? t.entryType;
  return (
    <div className="tourney-card">
      <div className="tourney-name">
        {t.displayName}
        <span
          style={{
            marginLeft: 6,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--accent-dim)',
          }}
        >
          {PROGRESSION_LABELS[t.progressionTier] ?? t.tier}
        </span>
      </div>
      <div className="tourney-meta">{t.description}</div>
      <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>
        {t.brand} · {entryLabel}
      </div>
      {teamReq && (
        <div style={{ fontSize: 10, color: canEnter ? 'var(--up)' : 'var(--danger)', marginBottom: 4 }}>
          {canEnter
            ? rankBypass
              ? `排名直通（当前${TIER_LABELS[team!.tier]}）`
              : hasTicket
                ? `持票参赛（当前${TIER_LABELS[team!.tier]}）`
              : '可参加'
            : !team
              ? '无战队'
              : `战队等级不足（当前${TIER_LABELS[team.tier]}）`
          } · 需要 {TIER_LABELS[teamReq]}及以上战队
        </div>
      )}
      {t.qualificationTargets && t.qualificationTargets.length > 0 && (
        <div style={{ fontSize: 10, color: hasTicket ? 'var(--fg-2)' : 'var(--danger)', marginBottom: 4 }}>
          资格要求 · {t.qualificationTargets.map((slot) => slotLabel(slot)).join(' / ')}
          {rankBypass ? ' · 可排名直通' : ''}
        </div>
      )}
      {t.qualificationMilestones && t.qualificationMilestones.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--accent-dim)', marginBottom: 4 }}>
          节点奖励 · {t.qualificationMilestones.map((milestone) => `${milestone.label}：${milestone.rewards.map((reward) => `${slotLabel(reward.slot)} x${reward.count}`).join(' + ')}`).join(' · ')}
        </div>
      )}
      {(!t.qualificationMilestones || t.qualificationMilestones.length === 0) && t.qualificationRewards && t.qualificationRewards.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--accent-dim)', marginBottom: 4 }}>
          夺冠奖励 · {t.qualificationRewards.map((reward) => `${slotLabel(reward.slot)} x${reward.count}`).join(' · ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="chip chip-up">{describeTournamentMoney(r.money)}</span>
        <span className="chip chip-up">{describeTournamentExp(r.experience)}</span>
        <span className="chip chip-up">{describeTournamentFame(r.fame)}</span>
        {r.stressDelta !== undefined && r.stressDelta > 0 && (
          <span className="chip chip-down">{describeTournamentStress(r.stressDelta)}</span>
        )}
        <span className="chip chip-neu">难度 {t.difficulty}</span>
      </div>
      <div className="tourney-footer">
        {t.fameRequired !== undefined && (
          <span style={{ fontSize: 10, color: 'var(--fg-2)' }}>
            名气≥{t.fameRequired}
          </span>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={busy || !canEnter}
          onClick={onSignup}
          style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto' }}
        >
          {busy ? '…' : canEnter ? '报名' : needsTicket && !hasTicket ? '缺资格' : !team ? '需要战队' : '等级不足'}
        </button>
      </div>
    </div>
  );
}
