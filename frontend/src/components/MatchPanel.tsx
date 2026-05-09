'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PendingMatch, Player, Tournament } from '@/lib/types';
import type { ClubTier } from '@/lib/types';
import {
  describeTournamentMoney,
  describeTournamentExp,
  describeTournamentFame,
  describeTournamentStress,
} from '@/lib/format';

const TIER_LABELS: Record<ClubTier, string> = {
  youth: '青训',
  'semi-pro': '半职业',
  pro: '职业',
  top: '顶级',
};

const PROGRESSION_LABELS: Record<string, string> = {
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

// Keep in sync with qualificationRewards / qualificationMilestones in tournaments.ts
const QUALIFICATION_OVERVIEW = [
  'B赛：夺冠可拿 A级公开预选门票，打通青训到二线入口',
  'A级：A公开预选 -> A正赛 -> 品牌S赛资格',
  'IEM：A赛 -> IEM公开预选 -> IEM正赛 / IEM Major',
  'BLAST：A赛 -> BLAST封闭预选 -> BLAST正赛',
  'PGL：A赛 -> PGL公开预选 -> PGL封闭预选 -> PGL Major',
  'EPL / EWC / FISSURE / StarSeries / CAC：当前仍以直邀和积分为主',
  '预选票跟人走；主赛资格跟队走，离队会失去战队资格',
  '资格门票跨年失效，需在当赛季内使用',
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
  onPlayerUpdate: (p: Player) => void;
}

export function MatchPanel({ sessionId, player, onPlayerUpdate }: Props) {
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
      const res = await api.signup(sessionId, tournamentId);
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
      const res = await api.withdraw(sessionId);
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
      <div
        style={{
          padding: '7px 8px 5px',
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-3)',
          borderBottom: '1px solid var(--border)',
          marginBottom: 6,
        }}
      >
        赛事日历
        {formatSlots(player.qualificationSlots ?? {}).length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal', color: 'var(--fg-2)' }}>
            个人资格：{formatSlots(player.qualificationSlots ?? {}).join(' · ')}
          </span>
        )}
        {formatSlots(player.teamQualificationSlots ?? {}).length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal', color: 'var(--accent-dim)' }}>
            战队资格：{formatSlots(player.teamQualificationSlots ?? {}).join(' · ')}
          </span>
        )}
      </div>
      <div style={{ padding: '0 2px 6px', fontSize: 10, color: 'var(--fg-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {QUALIFICATION_OVERVIEW.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>

      {player.pendingMatch ? (
        <PendingMatchCard
          pm={player.pendingMatch}
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
  onWithdraw,
  busy,
  confirmWithdraw,
  setConfirmWithdraw,
  stage,
}: {
  pm: PendingMatch;
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

function TournamentCard({
  t,
  team,
  qualificationSlots,
  teamQualificationSlots,
  onSignup,
  busy,
}: {
  t: Tournament;
  team: Player['team'];
  qualificationSlots: Record<string, number>;
  teamQualificationSlots: Record<string, number>;
  onSignup: () => void;
  busy: boolean;
}) {
  const r = t.reward;
  const teamReq = t.teamRequirement ?? null;
  const ticketBypass = !!team && hasQualTicket(t.qualificationTargets, qualificationSlots, teamQualificationSlots);
  const canEnter = teamReqMet(team, teamReq) || ticketBypass;
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
        {t.brand} · {ENTRY_LABELS[t.entryType] ?? t.entryType}
      </div>
      {teamReq && (
        <div style={{ fontSize: 10, color: canEnter ? 'var(--up)' : 'var(--danger)', marginBottom: 4 }}>
          {canEnter
            ? ticketBypass
              ? `持票破格（当前${TIER_LABELS[team!.tier]}）`
              : '可参加'
            : !team
              ? '无战队'
              : `战队等级不足（当前${TIER_LABELS[team.tier]}）`
          } · 需要 {TIER_LABELS[teamReq]}+ 战队
        </div>
      )}
      {t.qualificationTargets && t.qualificationTargets.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--fg-2)', marginBottom: 4 }}>
          资格要求 · {t.qualificationTargets.map((slot) => slotLabel(slot)).join(' / ')}
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
          {busy ? '…' : canEnter ? '报名' : !team ? '需要战队' : '等级不足'}
        </button>
      </div>
    </div>
  );
}
