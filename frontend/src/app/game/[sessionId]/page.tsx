'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { WelcomeCard } from '@/components/WelcomeCard';
import { EventCard } from '@/components/EventCard';
import { ChoiceList } from '@/components/ChoiceList';
import { ResultPanel } from '@/components/ResultPanel';
import { EndingPanel } from '@/components/EndingPanel';
import { ActionPanel } from '@/components/ActionPanel';
import { ShopPanel } from '@/components/ShopPanel';
import { Leaderboard } from '@/components/Leaderboard';
import { HudTopBar } from '@/components/HudTopBar';
import { ScheduleCalendarPanel } from '@/components/ScheduleCalendarPanel';
import TransitionOverlay from '@/components/TransitionOverlay';
import { ClubPanel } from '@/components/ClubPanel';
import { TeamOfferModal } from '@/components/TeamOfferModal';
import { LoanModal } from '@/components/LoanModal';
import { InjuryAlertModal, buildInjuryAlertFromEffects, type InjuryAlert } from '@/components/InjuryAlertModal';
import {
  CareerSuggestionStrip,
  PlayerProfilePanel,
  WorldNewsPanel,
} from '@/components/GameLayoutPanels';
import { useGameStore } from '@/store/gameStore';
import type { ActionResult, Player, RoundResult, RulesMeta, SocialPost, Trait } from '@/lib/types';
import type { SettlementActionResult, SettlementShopResult } from '@/components/ResultPanel';

function ResultSummaryBar({ result }: { result: RoundResult }) {
  const ok = result.success;
  const tier = result.resultTier;
  const isMatch = Boolean(result.matchStats);
  const isSeries = result.sequenceType === 'tournament-series' && Boolean(result.seriesScore);
  const isBreak = result.seriesStepKind === 'break';
  const isMapStep = result.seriesStepKind === 'map' && Boolean(result.matchStats);
  const seriesScoreText = result.seriesScore ? `${result.seriesScore.player}-${result.seriesScore.opponent}` : null;
  const mapScoreText = result.matchStats ? `${result.matchStats.teamScore}:${result.matchStats.enemyScore}` : null;
  const seriesLabel = result.seriesMapIndex && result.seriesMapCount
    ? `Map ${result.seriesMapIndex}/${result.seriesMapCount}`
    : null;
  const seriesMapHead = seriesLabel && result.seriesMapName ? `${seriesLabel} · ${result.seriesMapName}` : seriesLabel;
  return (
    <div className="settlement-result-panel result-summary-panel" style={{ marginBottom: 10 }}>
      <div className="result-meta">
        <span className={`result-badge ${tier ?? (ok ? 'success' : 'failure')}`}>
          {tier === 'critical_success'
            ? '大成功'
            : tier === 'critical_failure'
            ? '大失败'
            : ok
            ? '胜'
            : '败'}
        </span>
        {isMatch ? (
          <span className="result-roll" style={{ color: 'var(--fg-2)' }}>
            Rating {result.matchStats!.rating.toFixed(2)} · 难度 {result.dc}
          </span>
        ) : (
          <span className="result-roll">
            d20 <strong>{result.naturalRoll ?? '?'}</strong> → {result.roll} vs DC {result.dc}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            color: 'var(--fg-2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result.choiceLabel}
        </span>
      </div>
      {isSeries && seriesScoreText && (
        <div className="series-score-strip">
          <div className="series-score-head">
            <span className="series-score-label">
              {isBreak ? '中场休息' : result.seriesStepKind === 'final' ? '系列赛结算' : isMapStep && seriesMapHead ? seriesMapHead : '系列赛比分'}
            </span>
            {!isMapStep && seriesLabel && <span className="series-score-map">{seriesLabel}</span>}
          </div>
          <div className="series-score-value">
            <span className="series-score-team">{isMapStep && mapScoreText ? mapScoreText : seriesScoreText}</span>
          </div>
          {isMapStep && seriesScoreText && (
            <div className="series-score-foot">系列赛 {seriesScoreText}</div>
          )}
          {isBreak && seriesLabel && seriesScoreText && (
            <div className="series-score-foot">
              {seriesLabel} 后当前总比分 {seriesScoreText}
            </div>
          )}
        </div>
      )}
      {result.seriesStepKind === 'final' && Array.isArray(result.seriesMaps) && result.seriesMaps.length > 0 && (
        <div className="series-map-list">
          {result.seriesMaps.map((map) => (
            <div key={map.mapNumber} className="series-map-row">
              <span className="series-map-name">Map {map.mapNumber} {map.mapName}</span>
              <span className="series-map-score">{map.teamScore}:{map.enemyScore}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GamePage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;

  const {
    player,
    apiToken,
    currentEvent,
    queuedEvents,
    weeklyNews,
    roundPlan,
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
    setQueuedEvents,
    setWeeklyNews,
    setRoundPlan,
    setLoading,
    setError,
    clearLastResult,
  } = useGameStore();

  const [traits, setTraits] = useState<Trait[]>([]);
  const [rulesMeta, setRulesMeta] = useState<RulesMeta | null>(null);
  const [shaking, setShaking] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'left' | 'center' | 'right'>('center');
  const [centerTab, setCenterTab] = useState<'event' | 'news' | 'schedule' | 'shop' | 'team' | 'leaderboard'>('event');
  const prevStress = useRef(0);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [showLoan, setShowLoan] = useState(false);
  const [endingCareer, setEndingCareer] = useState(false);
  const [phase, setPhase] = useState<'action' | 'event' | 'settlement'>('action');
  const [actionResults, setActionResults] = useState<SettlementActionResult[]>([]);
  const [shopResults, setShopResults] = useState<SettlementShopResult[]>([]);
  const [shopNarratives, setShopNarratives] = useState<Record<string, string>>({});
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [injuryAlert, setInjuryAlert] = useState<InjuryAlert | null>(null);
  const [signupBusyId, setSignupBusyId] = useState<string | null>(null);

  const [streamingNarrative, setStreamingNarrative] = useState<string | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const narrateCtxRef = useRef<{ cancelled: boolean } | null>(null);
  const sessionRefreshSeqRef = useRef(0);

  const storageKey = `intro-seen-${sessionId}`;
  const [welcomeDismissed, setWelcomeDismissed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === '1'
  );
  const [preloadedIntro, setPreloadedIntro] = useState<string | null>(null);
  const [introLoading, setIntroLoading] = useState(!welcomeDismissed);
  const apiTokenStorageKey = `api-token-${sessionId}`;

  const dismissWelcome = () => {
    sessionStorage.setItem(storageKey, '1');
    setWelcomeDismissed(true);
  };

  useEffect(() => {
    if (apiToken) {
      sessionStorage.setItem(apiTokenStorageKey, apiToken);
    }
  }, [apiToken, apiTokenStorageKey]);

  const refreshSessionSnapshot = useCallback(async () => {
    const seq = ++sessionRefreshSeqRef.current;
    try {
      const session = await api.getSession(sessionId);
      if (sessionRefreshSeqRef.current !== seq) return;
      setPlayerState({
        player: session.player,
        careerInsight: session.careerInsight,
        leaderboard: session.leaderboard,
      });
      setCurrentEvent(session.currentEvent);
      setQueuedEvents(session.queuedEvents ?? []);
      setWeeklyNews(session.weeklyNews ?? []);
      setRoundPlan(session.roundPlan ?? null);
      setActiveEventSequence(session.activeEventSequence ?? null);
      setPhase(session.phase ?? 'action');
    } catch (e) {
      if (sessionRefreshSeqRef.current === seq) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [sessionId, setActiveEventSequence, setCurrentEvent, setError, setPhase, setPlayerState, setQueuedEvents, setRoundPlan, setWeeklyNews]);

  const handlePlayerUpdate = useCallback((updatedPlayer: Player) => {
    setPlayer(updatedPlayer);
    void refreshSessionSnapshot();
  }, [refreshSessionSnapshot, setPlayer]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 先并行取 session / traits / rules / health，session 返回后才有真实的 apiToken
    Promise.all([api.getSession(sessionId), api.listTraits(), api.getRulesMeta(), api.getHealth().catch(() => null)])
      .then(([session, t, rules, health]) => {
        if (cancelled) return;
        hydrateFromSession(session);
        setTraits(t.traits);
        setRulesMeta(rules);
        if (health) setAiActive(health.ai.active);
        setPhase(session.phase ?? 'action');
        setActionResults([]);
        setShopResults([]);
        setShopNarratives({});
        setSettlementLoading(false);
        setStreamingNarrative(null);
        setIsNarrating(false);
        setChoiceSubmitting(false);
        setInjuryAlert(null);
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
      setQueuedEvents(res.queuedEvents ?? []);
      setWeeklyNews(res.weeklyNews ?? []);
      setRoundPlan(res.roundPlan ?? null);
      setActiveEventSequence(res.activeEventSequence ?? null);
      setPhase(res.phase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransitioning(false);
      setLoading(false);
    }
  };

  const clearSettlementState = () => {
    setActionResults([]);
    setShopResults([]);
    setShopNarratives({});
    setStreamingNarrative(null);
    setSettlementLoading(false);
    setIsNarrating(false);
    setChoiceSubmitting(false);
    setInjuryAlert(null);
    clearLastResult();
  };

  const handleAdvanceRound = async () => {
    if (loading || transitioning || choiceSubmitting || settlementLoading || !player) return;

    if (phase === 'settlement') {
      setTransitioning(true);
      setError(null);
      try {
        await refreshSessionSnapshot();
        clearSettlementState();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setTransitioning(false);
      }
      return;
    }

    await handleEndActionPhase();
  };

  const handleScheduleSignup = async (tournamentId: string) => {
    if (loading || signupBusyId || !player) return;
    setSignupBusyId(tournamentId);
    setError(null);
    try {
      const res = await api.signup(sessionId, tournamentId, apiToken ?? undefined);
      setPlayer(res.player);
      await refreshSessionSnapshot();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSignupBusyId(null);
    }
  };

  const handleActionResult = (result: ActionResult, moneyChange: number) => {
    setActionResults((prev) => [...prev, { result, moneyChange }]);
    const alert = buildInjuryAlertFromEffects(result.statusEffects);
    if (alert) setInjuryAlert(alert);
  };

  const handleShopResult = (result: SettlementShopResult) => {
    setShopResults((prev) => [...prev, result]);
  };

  const handleEnterNextRound = () => {
    void handleAdvanceRound();
  };

  const handleEndCareer = async () => {
    if (endingCareer || loading || transitioning || choiceSubmitting || !player) return;
    setEndingCareer(true);
    setError(null);
    try {
      await api.endCareer(sessionId, apiToken ?? undefined);
      setShowNewGameModal(false);
      router.push(`/game/${sessionId}/summary`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEndingCareer(false);
    }
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
      const injuryNotice = buildInjuryAlertFromEffects(res.result.passiveEffects);
      if (injuryNotice) setInjuryAlert(injuryNotice);

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

  if ((!player || !rulesMeta) && loading) {
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

  if (!player || !rulesMeta) {
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
            {!player ? '找不到这个会话' : '规则配置未加载'}
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
  const advanceButtonLabel = phase === 'action'
    ? '推进到事件决策阶段'
    : '推进到下一回合';
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
      {endingCareer && (
        <TransitionOverlay
          visible
          title="正在整理生涯结算..."
          subtitle="请稍候，系统正在生成正式结算页"
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
              <CareerSuggestionStrip insight={careerInsight} />
              <ActionPanel
                key={player.round}
                sessionId={sessionId}
                player={player}
                enabled={isActionPhase && !loading && !settlementLoading && !isResting}
                actionPointMax={rulesMeta.actionPointMax}
                injuryRisk={rulesMeta.injuryRisk}
                onPlayerUpdate={handlePlayerUpdate}
                onActionResult={handleActionResult}
                disabledReason={actionLockedReason}
              />
              <div className="round-advance-sticky">
                <button
                  type="button"
                  className="primary-button round-advance-button"
                  disabled={loading || transitioning || choiceSubmitting || settlementLoading || phase === 'event'}
                  onClick={handleAdvanceRound}
                  title={phase === 'event' ? '等待事件结算后进入下一回合' : undefined}
                >
                  {advanceButtonLabel} →
                </button>
              </div>
            </>
          )}
        </aside>

        {/* Center: tab bar + tab content */}
        <main className="hud-center">
          {ended ? (
            <div className="center-tab-pane">
              <EndingPanel player={player} traits={traits} ending={ending ?? undefined} history={history} />
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
                {(['event', 'news', 'schedule', 'shop', 'team', 'leaderboard'] as const).map((tab) => {
                  const labels: Record<string, string> = {
                    event: '事件', news: '新闻', schedule: '赛程', shop: '商店', team: '战队', leaderboard: '排行榜',
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
                    {lastResult && currentEvent && (
                      <ResultSummaryBar result={lastResult} />
                    )}
                    {lastResult && !currentEvent && (
                      <ResultPanel
                        result={lastResult}
                        streamingNarrative={streamingNarrative}
                        isNarrating={isNarrating}
                        settlementLoading={settlementLoading}
                        actionResults={actionResults}
                        shopResults={shopResults}
                        shopNarratives={shopNarratives}
                        onEnterNextRound={handleEnterNextRound}
                        hideNextRound
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
                      </div>
                    ) : phase === 'settlement' ? (
                      lastResult ? null : <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>结算中…</div>
                    ) : phase === 'event' && currentEvent ? (
                      <>
                        {roundPlan && (
                          <div style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid var(--line)', background: 'var(--panel-2)', borderRadius: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 11, color: 'var(--fg-2)' }}>
                              <span>本周编排</span>
                              <span>{roundPlan.servedCount}/{roundPlan.targetCount} · {roundPlan.archetype}</span>
                            </div>
                            <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.min(100, (roundPlan.servedCount / Math.max(1, roundPlan.targetCount)) * 100)}%`,
                                  height: '100%',
                                  background: 'var(--accent)',
                                }}
                              />
                            </div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, color: 'var(--fg-3)' }}>
                              {roundPlan.theme && <span>{roundPlan.theme.group}</span>}
                              {roundPlan.tone && <span>{roundPlan.tone}</span>}
                              {roundPlan.theme?.tags?.length ? <span>{roundPlan.theme.tags.slice(0, 2).join(' · ')}</span> : null}
                            </div>
                          </div>
                        )}
                        <EventCard event={currentEvent} sequence={activeEventSequence} />
                        {queuedEvents.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-3)' }}>
                            本周剩余事件 {queuedEvents.length} 条
                          </div>
                        )}
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

                {centerTab === 'news' && (
                  <WorldNewsPanel
                    weeklyNews={weeklyNews}
                    socialPosts={socialPosts}
                    socialLoading={socialLoading}
                  />
                )}

                {centerTab === 'shop' && (
                  <ShopPanel
                    sessionId={sessionId}
                    player={player}
                    onPlayerUpdate={handlePlayerUpdate}
                    onRequestLoan={() => setShowLoan(true)}
                    onShopResult={handleShopResult}
                    enabled={isActionPhase && !loading && !settlementLoading && !isResting}
                    disabledReason={actionLockedReason}
                  />
                )}

                {centerTab === 'schedule' && (
                  <ScheduleCalendarPanel
                    sessionId={sessionId}
                    player={player}
                    insight={careerInsight}
                    busyTournamentId={signupBusyId}
                    onSignup={handleScheduleSignup}
                  />
                )}

                {centerTab === 'team' && (
                  <>
                  <ClubPanel
                      sessionId={sessionId}
                      player={player}
                      enabled={isActionPhase && !loading && !settlementLoading && !isResting}
                      onPlayerUpdate={handlePlayerUpdate}
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
          <PlayerProfilePanel player={player} traits={traits} insight={careerInsight} />
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
              setQueuedEvents(res.queuedEvents ?? []);
              setWeeklyNews(res.weeklyNews ?? []);
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
              setQueuedEvents(res.queuedEvents ?? []);
              setWeeklyNews(res.weeklyNews ?? []);
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
        onPlayerUpdate={handlePlayerUpdate}
      />

      <InjuryAlertModal
        alert={injuryAlert}
        onClose={() => setInjuryAlert(null)}
      />

      {/* New-game confirm modal */}
      {showNewGameModal && (
        <div className="modal-backdrop" onClick={() => setShowNewGameModal(false)}>
            <div className="modal new-game-modal" onClick={(e) => e.stopPropagation()}>
              <div className="new-game-modal-warn">
                结束当前生涯将放弃当前档案，此操作不可逆。
              </div>
              <div className="new-game-modal-summary">
              <EndingPanel player={player} traits={traits} ending={ending ?? undefined} history={history} />
              </div>
              {error && (
                <div className="error" style={{ marginTop: 10 }}>
                  错误：{error}
                </div>
              )}
            <div className="new-game-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowNewGameModal(false)}
                disabled={endingCareer}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void handleEndCareer();
                }}
                disabled={endingCareer}
              >
                确认，结束当前生涯
              </button>
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
          ← 结束当前生涯
        </button>
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
