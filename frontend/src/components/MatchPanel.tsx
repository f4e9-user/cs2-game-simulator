'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PendingMatch, Player, Tournament } from '@/lib/types';
import {
  describeTournamentMoney,
  describeTournamentExp,
  describeTournamentFame,
  describeTournamentStress,
} from '@/lib/format';

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
}: {
  pm: PendingMatch;
  onWithdraw: () => void;
  busy: boolean;
}) {
  return (
    <div className="pending-match-card">
      <div className="pending-match-name">{pm.name}</div>
      <div className="pending-match-meta">
        Y{pm.resolveYear} W{pm.resolveWeek} · 阶段 {pm.stageIndex + 1}
      </div>
      <button
        type="button"
        className="ghost-button"
        disabled={busy}
        onClick={onWithdraw}
        style={{ fontSize: 11, padding: '3px 8px' }}
      >
        {busy ? '退出中…' : '退赛'}
      </button>
    </div>
  );
}

function TournamentCard({
  t,
  onSignup,
  busy,
}: {
  t: Tournament;
  onSignup: () => void;
  busy: boolean;
}) {
  const r = t.reward;
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
          disabled={busy}
          onClick={onSignup}
          style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto' }}
        >
          {busy ? '…' : '报名'}
        </button>
      </div>
    </div>
  );
}
