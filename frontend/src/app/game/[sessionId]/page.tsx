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
import type { Player, Teammate, Trait } from '@/lib/types';

function statAvg(tm: Teammate): number {
  const s = tm.stats;
  return Math.round(((s.agility + s.intelligence + s.mentality + s.experience) / 4) * 10) / 10;
}

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
  const [mobileTab, setMobileTab] = useState<'left' | 'center' | 'right'>('center');
  const [centerTab, setCenterTab] = useState<'event' | 'shop' | 'team' | 'leaderboard'>('event');
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

  // 新事件到来时自动切回事件标签
  useEffect(() => {
    if (currentEvent) setCenterTab('event');
  }, [currentEvent?.id]);

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
      <div className="hud-body" data-tab={mobileTab}>
        {/* Left: tournaments + actions */}
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
            </>
          )}
        </aside>

        {/* Center: tab bar + tab content */}
        <main className="hud-center">
          {ended ? (
            <div className="center-tab-pane">
              <EndingPanel player={player} traits={traits} ending={ending ?? undefined} />
            </div>
          ) : (
            <>
              {/* 标签栏 */}
              <div className="center-tabs">
                {(['event', 'shop', 'team', 'leaderboard'] as const).map((tab) => {
                  const labels: Record<string, string> = {
                    event: '事件', shop: '商店', team: '战队信息', leaderboard: '排行榜',
                  };
                  const hasDot = tab === 'event' && centerTab !== 'event' && (!!currentEvent || actionsPhase);
                  return (
                    <button
                      key={tab}
                      type="button"
                      className={`center-tab${centerTab === tab ? ' active' : ''}`}
                      onClick={() => setCenterTab(tab)}
                    >
                      {labels[tab]}
                      {hasDot && <span className="center-tab-dot" />}
                    </button>
                  );
                })}
              </div>

              {/* 标签内容 */}
              <div className="center-tab-pane">
                {centerTab === 'event' && (
                  <>
                    {lastResult && <ResultPanel result={lastResult} />}
                    {actionsPhase ? (
                      <div className="actions-phase-banner">
                        <div className="actions-phase-title">行动阶段</div>
                        <div className="actions-phase-hint">
                          在「行动」面板执行日常行动（最多 4 次），或直接进入下一回合。
                        </div>
                        <button
                          type="button"
                          className="ghost-button mob-only"
                          style={{ marginTop: 10 }}
                          onClick={() => setMobileTab('left')}
                        >
                          → 前往行动面板
                        </button>
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
                        <div style={{ marginTop: 8, marginBottom: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>
                          选择行动
                        </div>
                        <ChoiceList choices={currentEvent.choices} disabled={loading} onPick={pickChoice} />
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>等待下一回合…</div>
                    )}
                    {error && <div className="error" style={{ marginTop: 8 }}>错误：{error}</div>}
                  </>
                )}

                {centerTab === 'shop' && (
                  <ShopPanel
                    sessionId={sessionId}
                    player={player}
                    onPlayerUpdate={(p: Player) => setPlayer(p)}
                  />
                )}

                {centerTab === 'team' && (
                  <>
                    {player.roster && player.roster.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', marginBottom: 6 }}>
                          阵容
                        </div>
                        <div className="roster-list">
                          {player.roster.map((tm) => (
                            <div key={tm.id} className="roster-row">
                              <span className="roster-role">[{tm.role}]</span>
                              <span className="roster-name">{tm.name}</span>
                              <span className="roster-traits">{tm.traits.join(' / ')}</span>
                              <span className="roster-avg">均值 {statAvg(tm)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <ClubPanel
                      sessionId={sessionId}
                      player={player}
                      enabled={actionsPhase}
                      onPlayerUpdate={(p: Player) => setPlayer(p)}
                    />
                  </>
                )}

                {centerTab === 'leaderboard' && (
                  <Leaderboard teams={leaderboard} />
                )}
              </div>
            </>
          )}
        </main>

        {/* Right: player info + feed */}
        <aside className="hud-right">
          <PlayerStats player={player} traits={traits} promotion={promotion} />
          <FeedPanel history={history} />
        </aside>
      </div>

      {/* Mobile tab navigation */}
      <nav className="mob-nav">
        <button
          type="button"
          className={`mob-tab${mobileTab === 'left' ? ' active' : ''}`}
          onClick={() => setMobileTab('left')}
        >
          {actionsPhase && mobileTab !== 'left' && (
            <span className="mob-tab-badge" />
          )}
          <span className="mob-tab-icon">⚔</span>
          <span className="mob-tab-label">行动</span>
        </button>
        <button
          type="button"
          className={`mob-tab${mobileTab === 'center' ? ' active' : ''}`}
          onClick={() => setMobileTab('center')}
        >
          <span className="mob-tab-icon">📋</span>
          <span className="mob-tab-label">事件</span>
        </button>
        <button
          type="button"
          className={`mob-tab${mobileTab === 'right' ? ' active' : ''}`}
          onClick={() => setMobileTab('right')}
        >
          <span className="mob-tab-icon">👤</span>
          <span className="mob-tab-label">选手</span>
        </button>
      </nav>

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
