'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PendingMatch, Player, Tournament } from '@/lib/types';

interface Props {
  sessionId: string;
  player: Player;
  // Notify parent that the player object changed (after signup/withdraw),
  // so it can refresh state. We just pass back the updated player.
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
    // Re-fetch when week or stage changes (tournaments depend on both).
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
    <div className="panel">
      <div className="panel-title">赛事日历</div>

      {player.pendingMatch ? (
        <PendingMatchCard
          pm={player.pendingMatch}
          onWithdraw={withdraw}
          busy={busyId === 'withdraw'}
        />
      ) : (
        <div>
          {loading ? (
            <div className="stat-desc">加载中…</div>
          ) : open.length === 0 ? (
            <div className="stat-desc">本月没有可报名的赛事。</div>
          ) : (
            <div className="grid" style={{ gap: 10 }}>
              {open.map((t) => (
                <TournamentCard
                  key={t.id}
                  t={t}
                  onSignup={() => signup(t.id)}
                  busy={busyId === t.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}
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
    <div
      style={{
        background: 'var(--bg-elev-2)',
        border: '1px solid var(--accent)',
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        已报名：{pm.name}
      </div>
      <div className="stat-desc">
        将在第 {pm.resolveYear} 年 第 {pm.resolveWeek} 周开赛
        {' · '}阶段 {pm.stageIndex + 1}
      </div>
      <button
        type="button"
        className="ghost-button"
        disabled={busy}
        onClick={onWithdraw}
        style={{ marginTop: 8 }}
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
    <div
      style={{
        background: 'var(--bg-elev-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            {t.name}
            <span className="badge" style={{ marginLeft: 8 }}>
              {t.tier}
            </span>
          </div>
          <div className="stat-desc">{t.description}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <span className="delta-chip up">钱 +{r.money}</span>
            <span className="delta-chip up">经验 +{r.experience}</span>
            <span className="delta-chip up">名气 +{r.fame}</span>
            {r.stressDelta !== undefined && r.stressDelta > 0 && (
              <span className="delta-chip down">压力 +{r.stressDelta}</span>
            )}
            {t.fameRequired !== undefined && (
              <span className="delta-chip">门槛 名气≥{t.fameRequired}</span>
            )}
            <span className="delta-chip">难度 {t.difficulty}</span>
          </div>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={onSignup}
        >
          {busy ? '报名中…' : '报名'}
        </button>
      </div>
    </div>
  );
}
