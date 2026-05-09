'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { WelcomeCard } from '@/components/WelcomeCard';
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
import { LoanPanel } from '@/components/LoanPanel';
import { useGameStore } from '@/store/gameStore';
import type { Player, SocialPost, Teammate, Trait } from '@/lib/types';

function statAvg(tm: Teammate): number {
  const s = tm.stats;
  return Math.round(((s.agility + s.intelligence + s.mentality + s.experience) / 4) * 10) / 10;
}

export default function GamePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const {
    player,
    apiToken,
    currentEvent,
    history,
    status,
    ending,
    lastResult,
    promotion,
    leaderboard,
    actionsPhase,
    pendingOffer,
    aiActive,
    loading,
    error,
    hydrateFromSession,
    applyChoiceResponse,
    setPlayer,
    setActionsPhase,
    setAiActive,
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
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);

  const storageKey = `intro-seen-${sessionId}`;
  const [welcomeDismissed, setWelcomeDismissed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === '1'
  );
  const [preloadedIntro, setPreloadedIntro] = useState<string | null>(null);
  const [introLoading, setIntroLoading] = useState(!welcomeDismissed);

  const dismissWelcome = () => {
    sessionStorage.setItem(storageKey, '1');
    setWelcomeDismissed(true);
  };

  // 当前展示用的事件（原文即时显示，个性化版本到了再替换）
  const [displayEvent, setDisplayEvent] = useState<typeof currentEvent>(null);

  // currentEvent 变化时立刻更新 displayEvent，同时后台请求个性化
  // actionsPhase 期间事件不展示给玩家，跳过个性化请求
  useEffect(() => {
    setDisplayEvent(currentEvent);
    if (!currentEvent || actionsPhase) return;
    let cancelled = false;
    api.personalizeEvent(sessionId, apiToken ?? undefined).then((res) => {
      if (cancelled || !res.personalized) return;
      const { narrative, choices: pChoices } = res.personalized;
      setDisplayEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          narrative,
          choices: prev.choices.map((c) => {
            const match = pChoices.find((p) => p.id === c.id);
            return match ? { ...c, description: match.description } : c;
          }),
        };
      });
    }).catch(() => { /* 静默降级，保持原文 */ });
    return () => { cancelled = true; };
  }, [currentEvent?.id, sessionId, actionsPhase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 先并行取 session / traits / health，session 返回后才有真实的 apiToken
    Promise.all([api.getSession(sessionId), api.listTraits(), api.getHealth().catch(() => null)])
      .then(([session, t, health]) => {
        if (cancelled) return;
        hydrateFromSession(session);
        setTraits(t.traits);
        if (health) setAiActive(health.ai.active);

        // 用 session.apiToken 触发 intro（fire-and-forget，不阻塞主流程）
        if (!welcomeDismissed) {
          api.getIntro(sessionId, session.apiToken)
            .then((introRes) => { if (!cancelled) setPreloadedIntro(introRes.intro); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setIntroLoading(false); });
        } else {
          setIntroLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e.message ?? e));
          setIntroLoading(false);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sessionId, hydrateFromSession, setLoading, setError]);

  // 新事件到来时自动切回事件标签
  useEffect(() => {
    if (currentEvent) setCenterTab('event');
  }, [currentEvent?.id]);

  // 刷新社区动态：player 首次加载后 & 每回合结束后（后端有 KV 缓存，重复请求不会重新调用 LLM）
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    setSocialLoading(true);
    api.getSocialFeed(sessionId, apiToken ?? undefined)
      .then((res) => { if (!cancelled) setSocialPosts(res.posts); })
      .catch(() => { /* 静默失败，保留上一次结果 */ })
      .finally(() => { if (!cancelled) setSocialLoading(false); });
    return () => { cancelled = true; };
  // player.round 是回合计数器，每回合结束时 +1，用它作唯一触发条件
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, player?.round]);

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

  const pickChoice = async (choiceId: string, customAction?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.submitChoice(sessionId, choiceId, customAction);
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
              <LoanPanel
                sessionId={sessionId}
                player={player}
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
          ) : !welcomeDismissed && history.length === 0 && !loading ? (
            <WelcomeCard
              player={player}
              traits={traits}
              intro={preloadedIntro}
              introLoading={introLoading}
              onDismiss={dismissWelcome}
            />
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
                    ) : displayEvent ? (
                      <>
                        <EventCard event={displayEvent} />
                        <div style={{ marginTop: 8, marginBottom: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>
                          选择行动
                        </div>
                        <ChoiceList choices={displayEvent.choices} disabled={loading} aiActive={aiActive} onPick={pickChoice} />
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
          <FeedPanel history={history} socialPosts={socialPosts} socialLoading={socialLoading} />
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
