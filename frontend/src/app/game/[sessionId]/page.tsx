'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { WelcomeCard } from '@/components/WelcomeCard';
import { EventCard } from '@/components/EventCard';
import { ChoiceList } from '@/components/ChoiceList';
import { PlayerStats } from '@/components/PlayerStats';
import { CareerGoalPanel } from '@/components/CareerGoalPanel';
import { ResultPanel } from '@/components/ResultPanel';
import { EndingPanel } from '@/components/EndingPanel';
import { MatchPanel } from '@/components/MatchPanel';
import { ActionPanel } from '@/components/ActionPanel';
import { ShopPanel } from '@/components/ShopPanel';
import { Leaderboard } from '@/components/Leaderboard';
import { FeedPanel } from '@/components/FeedPanel';
import { HudTopBar } from '@/components/HudTopBar';
import TransitionOverlay from '@/components/TransitionOverlay';
import { ClubPanel } from '@/components/ClubPanel';
import { TeamOfferModal } from '@/components/TeamOfferModal';
import { LoanModal } from '@/components/LoanModal';
import { useGameStore } from '@/store/gameStore';
import type { ActionResult, Player, SocialPost, Trait } from '@/lib/types';
import type { SettlementActionResult, SettlementShopResult } from '@/components/ResultPanel';

export default function GamePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const {
    player,
    apiToken,
    currentEvent,
    activeEventSequence,
    history,
    status,
    ending,
    lastResult,
    promotion,
    careerInsight,
    leaderboard,
    pendingOffer,
    aiActive,
    loading,
    transitioning,
    error,
    hydrateFromSession,
    applyChoiceResponse,
    setCurrentEvent,
    setActiveEventSequence,
    setPlayer,
    setCareerInsight,
    setPlayerState,
    setAiActive,
    setTransitioning,
    clearOffer,
    setLeaderboard,
    setLoading,
    setError,
    clearLastResult,
  } = useGameStore();

  const [traits, setTraits] = useState<Trait[]>([]);
  const [shaking, setShaking] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'left' | 'center' | 'right'>('center');
  const [centerTab, setCenterTab] = useState<'event' | 'shop' | 'team' | 'leaderboard'>('event');
  const prevStress = useRef(0);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [showLoan, setShowLoan] = useState(false);
  const [phase, setPhase] = useState<'action' | 'event' | 'settlement'>('action');
  const [actionResults, setActionResults] = useState<SettlementActionResult[]>([]);
  const [shopResults, setShopResults] = useState<SettlementShopResult[]>([]);
  const [shopNarratives, setShopNarratives] = useState<Record<string, string>>({});
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);

  const [streamingNarrative, setStreamingNarrative] = useState<string | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const narrateCtxRef = useRef<{ cancelled: boolean } | null>(null);

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
        setPhase(session.phase ?? 'action');
        setActionResults([]);
        setShopResults([]);
        setShopNarratives({});
        setSettlementLoading(false);
        setStreamingNarrative(null);
        setIsNarrating(false);
        setChoiceSubmitting(false);
        clearLastResult();

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
  }, [sessionId, hydrateFromSession, setLoading, setError, setAiActive, clearLastResult]);

  // 新事件到来时自动切回事件标签
  useEffect(() => {
    if (currentEvent) setCenterTab('event');
  }, [currentEvent?.id]);

  // 刷新社区动态：5 回合后才开始出现，之后每回合结束刷新一次
  useEffect(() => {
    if (!player || (player.round ?? 0) < 5) return;
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

  const isActionPhase = phase === 'action';

  const handleEndActionPhase = async () => {
    if (loading || transitioning || choiceSubmitting || !player) return;
    setError(null);
    setLoading(true);
    setTransitioning(true);
    try {
      const res = await api.endActionPhase(sessionId, apiToken ?? undefined);
      setPlayer(res.player);
      setCareerInsight(res.careerInsight ?? null);
      setCurrentEvent(res.currentEvent);
      setActiveEventSequence(res.activeEventSequence ?? null);
      setPhase(res.phase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransitioning(false);
      setLoading(false);
    }
  };

  const handleActionResult = (result: ActionResult, moneyChange: number) => {
    setActionResults((prev) => [...prev, { result, moneyChange }]);
  };

  const handleShopResult = (result: SettlementShopResult) => {
    setShopResults((prev) => [...prev, result]);
  };

  const handleEnterNextRound = () => {
    setTransitioning(true);
    setTimeout(() => {
      setTransitioning(false);
      setPhase('action');
      setActionResults([]);
      setShopResults([]);
      setShopNarratives({});
      setStreamingNarrative(null);
      setSettlementLoading(false);
      setIsNarrating(false);
      setChoiceSubmitting(false);
      clearLastResult();
    }, 400);
  };

  const pickChoice = async (choiceId: string, customAction?: string) => {
    if (loading || choiceSubmitting) return;

    // Cancel any in-flight narrative stream from a previous choice
    if (narrateCtxRef.current) narrateCtxRef.current.cancelled = true;
    setStreamingNarrative(null);
    setIsNarrating(false);

    setLoading(true);
    setChoiceSubmitting(true);
    setError(null);
    try {
      const res = await api.submitChoice(sessionId, choiceId, customAction, apiToken ?? undefined);
      applyChoiceResponse(res);

      const hasNextSequenceEvent = res.phase === 'event' && !!res.currentEvent;
      setPhase(hasNextSequenceEvent ? 'event' : 'settlement');
      if (hasNextSequenceEvent) {
        setStreamingNarrative(null);
        setIsNarrating(false);
        setSettlementLoading(false);
        return;
      }

      const settlementTasks: Promise<unknown>[] = [];

      // Kick off narrative streaming in parallel.
      if (aiActive && apiToken) {
        const ctx = { cancelled: false };
        narrateCtxRef.current = ctx;
        setIsNarrating(true);
        const streamTask = api.narrateStream(
          sessionId,
          {
            baseNarrative: res.result.narrative,
            eventTitle: res.result.eventTitle,
            choiceLabel: res.result.choiceLabel,
            success: res.result.success,
            customAction,
            matchStats: res.result.matchStats ?? undefined,
          },
          apiToken,
          (chunk) => {
            if (!ctx.cancelled) setStreamingNarrative((prev) => (prev ?? '') + chunk);
          },
        ).finally(() => {
          if (!ctx.cancelled) setIsNarrating(false);
        });
        settlementTasks.push(streamTask);
      }

      const shopSnapshot = [...shopResults];
      if (shopSnapshot.length > 0 && aiActive && apiToken) {
        for (const shop of shopSnapshot) {
          const task = api
            .narrateShop(
              sessionId,
              {
                itemName: shop.itemName,
                baseNarrative: shop.shopNarrative ?? '',
                positive: shop.shopNarrativePositive,
              },
              apiToken,
            )
            .then((r) => {
              if (!narrateCtxRef.current?.cancelled) {
                setShopNarratives((prev) => ({ ...prev, [shop.itemId]: r.narrative }));
              }
            })
            .catch(() => {
              if (!narrateCtxRef.current?.cancelled) {
                setShopNarratives((prev) => ({
                  ...prev,
                  [shop.itemId]: shop.shopNarrative ?? '购买结果已记录。',
                }));
              }
            });
          settlementTasks.push(task);
        }
      }

      if (settlementTasks.length > 0) {
        setSettlementLoading(true);
        await Promise.allSettled(settlementTasks);
      } else {
        setSettlementLoading(false);
      }

      setSettlementLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSettlementLoading(false);
    } finally {
      setLoading(false);
      setChoiceSubmitting(false);
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
  const isResting = (player.restRounds ?? 0) > 0;
  const actionLockedReason = isResting
    ? '休养期间不能进行日常行动、商店购买或队伍管理'
    : phase === 'settlement'
      ? '结算中，暂不可操作'
      : '先完成本回合事件决策';

  return (
    <div className={`hud-root${isCritical ? ' stress-critical' : ''}${shaking ? ' stress-shaking' : ''}`}>
      {/* 压力临界红框警告 */}
      {isCritical && <div className="stress-critical-overlay" />}
      {(transitioning || choiceSubmitting) && (
        <TransitionOverlay
          visible
          title={choiceSubmitting ? '正在生成叙事...' : '正在切换回合...'}
          subtitle={choiceSubmitting ? '请稍候，系统正在处理你的选择' : '请稍候，回合正在切换'}
        />
      )}

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
                enabled={isActionPhase && !loading && !settlementLoading && !isResting}
                onPlayerUpdate={(p: Player) => setPlayer(p)}
                onActionResult={handleActionResult}
                disabledReason={actionLockedReason}
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
                  const hasDot = tab === 'event' && centerTab !== 'event' && (!!currentEvent || phase !== 'event');
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
                    {lastResult && (
                      <ResultPanel
                        result={lastResult}
                        streamingNarrative={streamingNarrative}
                        isNarrating={isNarrating}
                        settlementLoading={settlementLoading}
                        actionResults={actionResults}
                        shopResults={shopResults}
                        shopNarratives={shopNarratives}
                        onEnterNextRound={handleEnterNextRound}
                        hideNextRound={Boolean(lastResult?.sequenceId) && !lastResult.sequenceFinal}
                      />
                    )}
                    {phase === 'action' ? (
                      <div className="actions-phase-banner">
                        <div className="actions-phase-title">行动阶段</div>
                        <div className="actions-phase-hint">
                          在左侧执行日常行动和商店购买，完成后再进入事件。
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
                          onClick={handleEndActionPhase}
                        >
                          结束行动 →
                        </button>
                      </div>
                    ) : phase === 'settlement' ? (
                      lastResult ? null : <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>结算中…</div>
                    ) : phase === 'event' && currentEvent ? (
                      <>
                        <EventCard event={currentEvent} sequence={activeEventSequence} />
                        <div style={{ marginTop: 8, marginBottom: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>
                          选择行动
                        </div>
                        <ChoiceList choices={currentEvent.choices} disabled={loading || choiceSubmitting} aiActive={aiActive} onPick={pickChoice} />
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
                    onRequestLoan={() => setShowLoan(true)}
                    onShopResult={handleShopResult}
                    enabled={isActionPhase && !loading && !settlementLoading && !isResting}
                    disabledReason={actionLockedReason}
                  />
                )}

                {centerTab === 'team' && (
                  <>
                    <ClubPanel
                      sessionId={sessionId}
                      player={player}
                      enabled={isActionPhase && !loading && !settlementLoading && !isResting}
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
          <CareerGoalPanel insight={careerInsight} />
          <PlayerStats player={player} traits={traits} />
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
          {isActionPhase && mobileTab !== 'left' && (
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
              const res = await api.respondOffer(sessionId, true, apiToken ?? undefined);
              setPlayerState({
                player: res.player,
                careerInsight: res.careerInsight,
                leaderboard: res.leaderboard,
              });
              setCurrentEvent(res.currentEvent ?? null);
              setActiveEventSequence(res.activeEventSequence ?? null);
              setPhase(res.phase ?? 'action');
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
              const res = await api.respondOffer(sessionId, false, apiToken ?? undefined);
              setPlayerState({
                player: res.player,
                careerInsight: res.careerInsight,
              });
              setCurrentEvent(res.currentEvent ?? null);
              setActiveEventSequence(res.activeEventSequence ?? null);
              setPhase(res.phase ?? 'action');
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

      <LoanModal
        open={showLoan}
        onClose={() => setShowLoan(false)}
        sessionId={sessionId}
        player={player}
        onPlayerUpdate={(p: Player) => setPlayer(p)}
      />

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
        {settlementLoading && !loading && (
          <span style={{ fontSize: 11, color: 'var(--fg-3)', marginLeft: 'auto' }}>
            结算中…
          </span>
        )}
      </footer>
    </div>
  );
}
