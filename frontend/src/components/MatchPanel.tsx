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

const TOURNAMENT_TEAM_REQ: Record<string, ClubTier | null> = {
  netcafe: null,
  city: null,
  platform: null,
  'secondary-league': 'youth',
  'development-league': 'semi-pro',
  tier2: 'pro',
  tier1: 'pro',
  's-class': 'top',
  major: 'top',
};

const TIER_LABELS: Record<ClubTier, string> = {
  youth: '青训',
  'semi-pro': '半职业',
  pro: '职业',
  top: '顶级',
};

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
  }, [sessionId, player.week, player.stage, player.fame]);

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
      <div className="pending-match-name">{pm.name}</div>
      <div className="pending-match-meta">
        Y{pm.resolveYear} W{pm.resolveWeek} · 阶段 {pm.stageIndex + 1}
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

function TournamentCard({
  t,
  team,
  onSignup,
  busy,
}: {
  t: Tournament;
  team: Player['team'];
  onSignup: () => void;
  busy: boolean;
}) {
  const r = t.reward;
  const teamReq = TOURNAMENT_TEAM_REQ[t.tier] ?? null;
  const canEnter = teamReqMet(team, teamReq);
  return (
    <div className="tourney-card">
      <div className="tourney-name">
        {t.name}
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
          {t.tier}
        </span>
      </div>
      <div className="tourney-meta">{t.description}</div>
      {teamReq && (
        <div style={{ fontSize: 10, color: canEnter ? 'var(--up)' : 'var(--danger)', marginBottom: 4 }}>
          {canEnter ? '🔓' : '🔒'} 需要 {TIER_LABELS[teamReq]}+ 战队
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
          {busy ? '…' : canEnter ? '报名' : '缺战队'}
        </button>
      </div>
    </div>
  );
}
