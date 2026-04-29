'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { EventCard } from '@/components/EventCard';
import { ChoiceList } from '@/components/ChoiceList';
import { PlayerStats } from '@/components/PlayerStats';
import { ResultPanel } from '@/components/ResultPanel';
import { MatchPanel } from '@/components/MatchPanel';
import { Leaderboard } from '@/components/Leaderboard';
import { FeedPanel } from '@/components/FeedPanel';
import { HudTopBar } from '@/components/HudTopBar';
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
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          fontSize: 13,
          color: 'var(--fg-2)',
        }}
      >
        载入中…
      </div>
    );
  }

  if (!player) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 12 }}>
            找不到这个会话
          </div>
          <Link href="/" className="ghost-button">
            回到首页
          </Link>
        </div>
      </div>
    );
  }

  const ended = status === 'ended';

  return (
    <div className="hud-root">
      {/* Top bar */}
      <HudTopBar player={player} leaderboard={leaderboard} />

      {/* Main body */}
      <div className="hud-body">
        {/* Left: tournaments + leaderboard */}
        <aside className="hud-left">
          {!ended && (
            <MatchPanel
              sessionId={sessionId}
              player={player}
              onPlayerUpdate={(p: Player) => setPlayer(p)}
            />
          )}
          <Leaderboard teams={leaderboard} />
        </aside>

        {/* Center: event narrative + choices */}
        <main className="hud-center">
          {ended ? (
            <div className="ending-panel">
              <div className="ending-title">生涯结束</div>
              <div className="ending-result">
                {ending ? (ENDING_LABELS[ending] ?? ending) : '未知结局'}
              </div>
              <Link href="/" className="primary-button">
                再来一次
              </Link>
            </div>
          ) : (
            <>
              {lastResult && <ResultPanel result={lastResult} />}

              {currentEvent ? (
                <>
                  <EventCard event={currentEvent} />
                  <div
                    style={{
                      marginTop: 8,
                      marginBottom: 4,
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--fg-3)',
                    }}
                  >
                    选择行动
                  </div>
                  <ChoiceList
                    choices={currentEvent.choices}
                    disabled={loading}
                    onPick={pickChoice}
                  />
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>
                  等待下一回合…
                </div>
              )}

              {error && (
                <div className="error" style={{ marginTop: 8 }}>
                  错误：{error}
                </div>
              )}
            </>
          )}
        </main>

        {/* Right: player info + feed */}
        <aside className="hud-right">
          <PlayerStats player={player} traits={traits} promotion={promotion} />
          <FeedPanel history={history} />
        </aside>
      </div>

      {/* Bottom bar */}
      <footer className="hud-bottom">
        <Link
          href="/"
          className="ghost-button"
          style={{ fontSize: 11, padding: '3px 10px' }}
        >
          ← 新生涯
        </Link>
        <span
          style={{
            fontSize: 10,
            color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {sessionId.slice(0, 8)}…
        </span>
        {player.restRounds > 0 && (
          <span className="status-alert danger">
            休养中 {player.restRounds}回合
          </span>
        )}
        {player.stressMaxRounds > 0 && (
          <span className="status-alert danger">
            压力临界 {player.stressMaxRounds} 回合
          </span>
        )}
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--fg-3)', marginLeft: 'auto' }}>
            处理中…
          </span>
        )}
      </footer>
    </div>
  );
}
