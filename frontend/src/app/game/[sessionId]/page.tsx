'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { EventCard } from '@/components/EventCard';
import { ChoiceList } from '@/components/ChoiceList';
import { PlayerStats } from '@/components/PlayerStats';
import { ResultPanel } from '@/components/ResultPanel';
import { EndingPanel } from '@/components/EndingPanel';
import { MatchPanel } from '@/components/MatchPanel';
import { ActionPanel } from '@/components/ActionPanel';
import { ShopPanel } from '@/components/ShopPanel';
import { Leaderboard } from '@/components/Leaderboard';
import { FeedPanel } from '@/components/FeedPanel';
import { HudTopBar } from '@/components/HudTopBar';
import { ClubPanel } from '@/components/ClubPanel';
import { TeamOfferModal } from '@/components/TeamOfferModal';
import { useGameStore } from '@/store/gameStore';
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
    actionsPhase,
    pendingOffer,
    loading,
    error,
    hydrateFromSession,
    applyChoiceResponse,
    setPlayer,
    setActionsPhase,
    clearOffer,
    setLeaderboard,
    setLoading,
    setError,
  } = useGameStore();

  const [traits, setTraits] = useState<Trait[]>([]);
  const [shaking, setShaking] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const prevStress = useRef(0);

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

  // 压力首次达到 100 时触发震动动画
  useEffect(() => {
    if (!player) return;
    const cur = player.stress ?? 0;
    if (cur >= 100 && prevStress.current < 100) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 700);
      prevStress.current = cur;
      return () => clearTimeout(t);
    }
    prevStress.current = cur;
  }, [player?.stress]);

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
  const isCritical = (player.stress ?? 0) >= 100;

  return (
    <div className={`hud-root${isCritical ? ' stress-critical' : ''}${shaking ? ' stress-shaking' : ''}`}>
      {/* 压力临界红框警告 */}
      {isCritical && <div className="stress-critical-overlay" />}

      {/* Top bar */}
      <HudTopBar player={player} leaderboard={leaderboard} />

      {/* Main body */}
      <div className="hud-body">
        {/* Left: tournaments + actions + shop + leaderboard */}
        <aside className="hud-left">
          {!ended && (
            <>
              <MatchPanel
                sessionId={sessionId}
                player={player}
                onPlayerUpdate={(p: Player) => setPlayer(p)}
              />
              <ActionPanel
                key={player.round}
                sessionId={sessionId}
                player={player}
                enabled={actionsPhase}
                onPlayerUpdate={(p: Player) => setPlayer(p)}
              />
              <ShopPanel
                sessionId={sessionId}
                player={player}
                onPlayerUpdate={(p: Player) => setPlayer(p)}
              />
              <ClubPanel
                sessionId={sessionId}
                player={player}
                enabled={actionsPhase}
                onPlayerUpdate={(p: Player) => setPlayer(p)}
              />
            </>
          )}
          {player.stage !== 'rookie' && <Leaderboard teams={leaderboard} />}
        </aside>

        {/* Center: event narrative + choices */}
        <main className="hud-center">
          {ended ? (
            <EndingPanel player={player} traits={traits} ending={ending ?? undefined} />
          ) : (
            <>
              {lastResult && <ResultPanel result={lastResult} />}

              {actionsPhase ? (
                /* 行动阶段：事件隐藏，等待玩家完成日常行动 */
                <div className="actions-phase-banner">
                  <div className="actions-phase-title">行动阶段</div>
                  <div className="actions-phase-hint">
                    在左侧面板执行日常行动（最多 4 次），或直接进入下一回合。
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    style={{ marginTop: 12 }}
                    onClick={() => setActionsPhase(false)}
                  >
                    进入下一回合 →
                  </button>
                </div>
              ) : currentEvent ? (
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

      {/* Team offer modal */}
      {pendingOffer && (
        <TeamOfferModal
          offer={pendingOffer}
          onAccept={async () => {
            setLoading(true);
            try {
              const res = await api.respondOffer(sessionId, true);
              setPlayer(res.player);
              if (res.leaderboard) setLeaderboard(res.leaderboard);
              clearOffer();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setLoading(false);
            }
          }}
          onDecline={async () => {
            setLoading(true);
            try {
              const res = await api.respondOffer(sessionId, false);
              setPlayer(res.player);
              clearOffer();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setLoading(false);
            }
          }}
          loading={loading}
        />
      )}

      {/* New-game confirm modal */}
      {showNewGameModal && (
        <div className="modal-backdrop" onClick={() => setShowNewGameModal(false)}>
          <div className="modal new-game-modal" onClick={(e) => e.stopPropagation()}>
            <div className="new-game-modal-warn">
              开始新生涯将放弃当前档案，此操作不可逆。
            </div>
            <div className="new-game-modal-summary">
              <EndingPanel player={player} traits={traits} ending={ending ?? undefined} />
            </div>
            <div className="new-game-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowNewGameModal(false)}
              >
                取消
              </button>
              <Link href="/" className="primary-button">
                确认，开始新生涯
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <footer className="hud-bottom">
        <button
          type="button"
          className="ghost-button"
          style={{ fontSize: 11, padding: '3px 10px' }}
          onClick={() => setShowNewGameModal(true)}
        >
          ← 新生涯
        </button>
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
