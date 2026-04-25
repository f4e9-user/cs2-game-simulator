'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { EventCard } from '@/components/EventCard';
import { ChoiceList } from '@/components/ChoiceList';
import { PlayerStats } from '@/components/PlayerStats';
import { ResultPanel } from '@/components/ResultPanel';
import { HistoryPanel } from '@/components/HistoryPanel';
import { MatchPanel } from '@/components/MatchPanel';
import { Leaderboard } from '@/components/Leaderboard';
import { useGameStore } from '@/store/gameStore';
import { ENDING_LABELS } from '@/lib/format';
import type { Player, Trait } from '@/lib/types';

export default function GamePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const {
    player,
    currentEvent,
    history,
    status,
    ending,
    lastResult,
    promotion,
    leaderboard,
    loading,
    error,
    hydrateFromSession,
    applyChoiceResponse,
    setPlayer,
    setLoading,
    setError,
  } = useGameStore();

  const [traits, setTraits] = useState<Trait[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getSession(sessionId), api.listTraits()])
      .then(([session, t]) => {
        if (cancelled) return;
        hydrateFromSession(session);
        setTraits(t.traits);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sessionId, hydrateFromSession, setLoading, setError]);

  const pickChoice = async (choiceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.submitChoice(sessionId, choiceId);
      applyChoiceResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!player && loading) {
    return <div className="panel">载入中…</div>;
  }
  if (!player) {
    return (
      <div className="panel">
        <div className="narrative">找不到这个会话。</div>
        <Link href="/" className="ghost-button" style={{ marginTop: 12 }}>
          回到首页
        </Link>
      </div>
    );
  }

  const ended = status === 'ended';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
        <Link href="/" className="ghost-button">← 开始新的生涯</Link>
        <div className="stat-desc">会话 ID：{sessionId.slice(0, 8)}…</div>
      </div>

      <div className="grid grid-2">
        <div>
          {lastResult && <ResultPanel result={lastResult} />}

          {ended ? (
            <div className="panel">
              <div className="panel-title">生涯结束</div>
              <div className="narrative">
                你的结局：
                <strong>
                  {ending ? (ENDING_LABELS[ending] ?? ending) : '未知'}
                </strong>
                。
              </div>
              <div style={{ marginTop: 12 }}>
                <Link href="/" className="primary-button">
                  再来一次
                </Link>
              </div>
            </div>
          ) : currentEvent ? (
            <>
              <EventCard event={currentEvent} />
              <div className="panel">
                <div className="panel-title">你的选择</div>
                <ChoiceList
                  choices={currentEvent.choices}
                  disabled={loading}
                  onPick={pickChoice}
                />
              </div>
            </>
          ) : (
            <div className="panel">等待下一回合…</div>
          )}

          {error && <div className="error">错误：{error}</div>}
        </div>

        <div>
          <PlayerStats player={player} traits={traits} promotion={promotion} />
          {!ended && (
            <MatchPanel
              sessionId={sessionId}
              player={player}
              onPlayerUpdate={(p: Player) => setPlayer(p)}
            />
          )}
          <Leaderboard teams={leaderboard} />
          <HistoryPanel history={history} />
        </div>
      </div>
    </div>
  );
}
