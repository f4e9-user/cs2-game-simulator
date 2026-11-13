import { useEffect } from 'react';
import { TypewriterText } from '@/components/TypewriterText';
import type { ActionResult, MatchStats, RoundResult, StatKey } from '@/lib/types';
import {
  PASSIVE_EFFECT_LABELS,
  STAGE_LABELS,
  describeFeelChange,
  describeTiltChange,
  describeFatigueChange,
  describeStressChange,
  describeFameChange,
  describeStatChange,
  describeBuffAdded,
  formatTag,
} from '@/lib/format';

type PassiveEffectTone = 'positive' | 'negative' | 'neutral';

const NEGATIVE_PASSIVE_EFFECT_IDS = new Set([
  'broke-mentality-drain',
  'stress-from-anxiety',
  'stress-from-failure',
  'stress-from-broke',
  'stress-pegged-1',
  'injury-triggered',
  'physical-collapse-rest',
  'critical-failure-penalty',
]);

const POSITIVE_PASSIVE_EFFECT_IDS = new Set([
  'stress-decay-mentality',
  'fatigue-mult-reduced',
  'stress-mult-reduced',
  'stress-eased',
  'career-time-experience',
  'rest-completed',
  'critical-success-bonus',
]);

export function passiveEffectTone(raw: string): PassiveEffectTone {
  if (NEGATIVE_PASSIVE_EFFECT_IDS.has(raw)) return 'negative';
  if (POSITIVE_PASSIVE_EFFECT_IDS.has(raw)) return 'positive';

  const text = PASSIVE_EFFECT_LABELS[raw] ?? raw;
  if (
    /违约|强制休养|伤病|崩溃|见底|失败|惩罚|危机|禁赛|下调|支出|还款|维护|压力\s*(?:\+|上升)|疲劳\s*(?:\+|上升)|心态\s*-|手感\s*-|名气\s*-|信用值\s*-|-\d+K|放大了/.test(
      text,
    )
  ) {
    return 'negative';
  }

  if (
    /入账|收入|结清|恢复|成长|经验|大成功|天选|解除|缓解|下降|降低了|手感\s*\+|压力\s*-|疲劳\s*-|信任\s*\+|默契\s*\+|信用值\s*\+|\+\d+K/.test(
      text,
    )
  ) {
    return 'positive';
  }

  return 'neutral';
}

export interface SettlementActionResult {
  result: ActionResult;
  moneyChange: number;
}

export interface SettlementShopResult {
  itemId: string;
  itemName: string;
  shopNarrative?: string;
  shopNarrativePositive?: boolean;
  shopBuffLabelsAdded?: string[];
  shopBuffLabelsRemoved?: string[];
  shopTagsAdded?: string[];
  shopTagsRemoved?: string[];
}

interface Props {
  result: RoundResult;
  streamingNarrative?: string | null;
  isNarrating?: boolean;
  settlementLoading?: boolean;
  actionResults?: SettlementActionResult[];
  shopResults?: SettlementShopResult[];
  shopNarratives?: Record<string, string>;
  onEnterNextRound?: () => void;
  hideNextRound?: boolean;
}

export function ResultPanel({
  result,
  streamingNarrative,
  isNarrating,
  settlementLoading,
  actionResults = [],
  shopResults = [],
  shopNarratives = {},
  onEnterNextRound,
  hideNextRound = false,
}: Props) {
  const deltas = Object.entries(result.statChanges) as [StatKey, number][];
  const stageChanged = result.stageBefore !== result.stageAfter;
  const passives = Array.from(new Set(result.passiveEffects ?? []));
  const qualificationChanges = result.qualificationChanges ?? [];
  const buffsAdded = result.buffsAdded ?? [];
  const tagsAdded = result.tagsAdded ?? [];
  const tagsRemoved = result.tagsRemoved ?? [];
  const stressChange = result.stressChange ?? 0;
  const fameChange = result.fameChange ?? 0;
  const feelChange = result.feelChange ?? 0;
  const tiltChange = result.tiltChange ?? 0;
  const fatigueChange = result.fatigueChange ?? 0;
  const ok = result.success;
  const tier = result.resultTier;
  const isCrit = tier === 'critical_success' || tier === 'critical_failure';
  const isMatch = Boolean(result.matchStats);
  const isSeriesMap = result.sequenceType === 'tournament-series' && result.seriesStepKind === 'map' && Boolean(result.matchStats);
  const isSeriesBreak = result.sequenceType === 'tournament-series' && result.seriesStepKind === 'break';
  const isSeriesFinal = result.sequenceType === 'tournament-series' && result.seriesStepKind === 'final';
  const pendingShopNarratives = shopResults.some((shop) => !(shop.itemId in shopNarratives));
  const loadingActive = Boolean(settlementLoading || isNarrating || pendingShopNarratives);

  useEffect(() => {
    if (loadingActive || !onEnterNextRound || hideNextRound) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onEnterNextRound();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hideNextRound, loadingActive, onEnterNextRound]);

  const hasChips =
    deltas.length > 0 ||
    stageChanged ||
    buffsAdded.length > 0 ||
    tagsAdded.length > 0 ||
    tagsRemoved.length > 0 ||
    stressChange !== 0 ||
    fameChange !== 0 ||
    feelChange !== 0 ||
    tiltChange !== 0 ||
    fatigueChange !== 0;

  return (
    <div className={`result-panel settlement-result-panel ${ok ? 'ok' : 'fail'}${isCrit ? ' crit' : ''}`}>
      {loadingActive && (
        <div className="settlement-loading-overlay" aria-live="polite" aria-busy="true">
          <div className="settlement-loading-spinner" />
          <div className="settlement-loading-text">正在书写本回合叙事…</div>
          <div className="settlement-loading-subtext">根据你的选择和特质生成专属叙事中</div>
          {shopResults.length > 0 && (
            <div className="settlement-loading-subtext">正在润色商店购买叙事…</div>
          )}
        </div>
      )}

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

      {result.seriesScore ? (
        <SeriesScoreCard
          score={result.seriesScore}
          won={ok}
          kind={isSeriesFinal ? 'final' : isSeriesBreak ? 'break' : isSeriesMap ? 'map' : 'series'}
          label={result.seriesMapIndex && result.seriesMapCount
            ? `Map ${result.seriesMapIndex}/${result.seriesMapCount}${result.seriesMapName ? ` · ${result.seriesMapName}` : ''}`
            : undefined}
        />
      ) : result.matchStats ? (
        <MatchStatsCard stats={result.matchStats} won={ok} />
      ) : null}

      {isSeriesMap && result.matchStats && (
        <MatchStatsCard
          stats={result.matchStats}
          won={ok}
          label={result.seriesMapName && result.seriesMapIndex && result.seriesMapCount
            ? `Map ${result.seriesMapIndex}/${result.seriesMapCount} · ${result.seriesMapName}`
            : undefined}
        />
      )}

      <div className="result-narrative">
        {isNarrating && !streamingNarrative ? (
          <div className="narrative-skeleton" />
        ) : streamingNarrative != null ? (
          streamingNarrative
        ) : (
          <TypewriterText text={result.narrative} />
        )}
      </div>

      {passives.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {passives.map((p) => (
            <div key={p} className={`passive-effect-line passive-effect-line--${passiveEffectTone(p)}`}>
              · {PASSIVE_EFFECT_LABELS[p] ?? p}
            </div>
          ))}
        </div>
      )}

      {qualificationChanges.length > 0 && <QualificationResultCard changes={qualificationChanges} />}

      {hasChips && (
        <div className="chips-row">
          {stageChanged && (
            <span className="chip chip-up">
              {STAGE_LABELS[result.stageBefore]} → {STAGE_LABELS[result.stageAfter]}
            </span>
          )}
          {feelChange !== 0 && (
            <span className={`chip ${feelChange > 0 ? 'chip-up' : 'chip-down'}`}>
              {describeFeelChange(feelChange)}
            </span>
          )}
          {tiltChange !== 0 && (
            <span className={`chip ${tiltChange > 0 ? 'chip-down' : 'chip-up'}`}>
              {describeTiltChange(tiltChange)}
            </span>
          )}
          {fatigueChange !== 0 && (
            <span className={`chip ${fatigueChange > 0 ? 'chip-down' : 'chip-up'}`}>
              {describeFatigueChange(fatigueChange)}
            </span>
          )}
          {stressChange !== 0 && (
            <span className={`chip ${stressChange > 0 ? 'chip-down' : 'chip-up'}`}>
              {describeStressChange(stressChange)}
            </span>
          )}
          {fameChange !== 0 && (
            <span className={`chip ${fameChange >= 0 ? 'chip-up' : 'chip-down'}`}>
              {describeFameChange(fameChange)}
            </span>
          )}
          {deltas.map(([k, v]) => (
            <span key={k} className={`chip ${v >= 0 ? 'chip-up' : 'chip-down'}`}>
              {describeStatChange(k, v)}
            </span>
          ))}
          {buffsAdded.map((b) => (
            <span key={b.id} className="chip chip-buff">
              {describeBuffAdded(b)}
            </span>
          ))}
          {tagsAdded.map((tag) => (
            <span key={`tag-add-${tag}`} className="chip chip-up" title={tag}>
              标签 +{formatTag(tag)}
            </span>
          ))}
          {tagsRemoved.map((tag) => (
            <span key={`tag-rm-${tag}`} className="chip chip-down" title={tag}>
              标签 -{formatTag(tag)}
            </span>
          ))}
        </div>
      )}

      {(actionResults.length > 0 || shopResults.length > 0) && (
        <div className="settlement-section">
          <div className="settlement-section-title">
            {actionResults.length > 0 ? '本回合行动' : '商店购买'}
          </div>

          {actionResults.length > 0 && (
            <>
              {shopResults.length > 0 && (
                <div className="settlement-subsection-title">日常行动</div>
              )}
              <div className="settlement-section-list">
                {actionResults.map((entry, idx) => (
                  <div key={`${entry.result.actionId}-${idx}`} className="settlement-action-row">
                    <div className="settlement-row-head">
                      <span className={`badge ${entry.result.success ? 'success' : 'danger'}`}>
                        {entry.result.actionLabel}
                      </span>
                      <span className="settlement-row-meta">
                        {entry.result.success ? '成功' : '失败'} · {entry.result.roll} vs {entry.result.dc}
                      </span>
                    </div>
                    <div className="settlement-row-narrative">{entry.result.narrative}</div>
                    <div className="chips-row">
                      {entry.result.feelChange !== 0 && (
                        <span className={`chip ${entry.result.feelChange > 0 ? 'chip-up' : 'chip-down'}`}>
                          {describeFeelChange(entry.result.feelChange)}
                        </span>
                      )}
                      {entry.result.fatigueChange !== 0 && (
                        <span className={`chip ${entry.result.fatigueChange > 0 ? 'chip-down' : 'chip-up'}`}>
                          {describeFatigueChange(entry.result.fatigueChange)}
                        </span>
                      )}
                      {entry.result.stressChange !== 0 && (
                        <span className={`chip ${entry.result.stressChange > 0 ? 'chip-down' : 'chip-up'}`}>
                          {describeStressChange(entry.result.stressChange)}
                        </span>
                      )}
                      {entry.moneyChange !== 0 && (
                        <span className={`chip ${entry.moneyChange > 0 ? 'chip-up' : 'chip-down'}`}>
                          金钱 {entry.moneyChange > 0 ? '+' : ''}{entry.moneyChange}K
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {shopResults.length > 0 && (
            <>
              {actionResults.length > 0 && (
                <div className="settlement-subsection-title">商店行动</div>
              )}
              <div className="settlement-section-list">
                {shopResults.map((shop, idx) => {
                  const narrative = shopNarratives[shop.itemId] ?? shop.shopNarrative ?? '购买结果已记录。';
                  return (
                    <div key={`${shop.itemId}-${idx}`} className="settlement-shop-row">
                      <div className="settlement-row-head">
                        <span className="badge accent">{shop.itemName}</span>
                        <span className="settlement-row-meta">
                          {shop.shopNarrativePositive === false ? '波折' : '顺利'}
                        </span>
                      </div>
                      <div className="settlement-row-narrative">{narrative}</div>
                      <div className="chips-row">
                        {shop.shopBuffLabelsAdded?.map((label) => (
                          <span key={`add-${label}`} className="chip chip-up">Buff +{label}</span>
                        ))}
                        {shop.shopBuffLabelsRemoved?.map((label) => (
                          <span key={`rm-${label}`} className="chip chip-down">Buff -{label}</span>
                        ))}
                        {shop.shopTagsAdded?.map((label) => (
                          <span key={`tag-add-${label}`} className="chip chip-up" title={label}>标签 +{formatTag(label)}</span>
                        ))}
                        {shop.shopTagsRemoved?.map((label) => (
                          <span key={`tag-rm-${label}`} className="chip chip-down" title={label}>标签 -{formatTag(label)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {!loadingActive && onEnterNextRound && !hideNextRound && (
        <div className="settlement-footer">
          <button type="button" className="primary-button" onClick={onEnterNextRound}>
            进入下一回合 →
          </button>
        </div>
      )}
    </div>
  );
}

function QualificationResultCard({ changes }: { changes: string[] }) {
  const title = changes.length > 1 ? '资格变动' : '资格获得';

  return (
    <div className="qualification-result-card">
      <div className="qualification-result-tag">资格更新</div>
      <div className="qualification-result-title">{title}</div>
      <div className="qualification-result-list">
        {changes.map((change) => (
          <div key={change} className="qualification-result-line">
            {change}
          </div>
        ))}
      </div>
    </div>
  );
}

function ratingColor(rating: number): string {
  if (rating >= 1.4) return 'var(--success)';
  if (rating >= 1.1) return '#7ec8e3';
  if (rating >= 0.9) return 'var(--fg-1)';
  return 'var(--danger)';
}

function MatchStatsCard({ stats, won, label }: { stats: MatchStats; won: boolean; label?: string }) {
  const { kills, deaths, assists, headshotRate, rating, teamScore, enemyScore } = stats;
  const kd = (kills / deaths).toFixed(2);
  const hsrPct = Math.round(headshotRate * 100);

  return (
    <div className="match-stats-card">
      {label && <div className="match-stats-head">{label}</div>}
      <div className="match-score-row">
        <span className={`match-score-team ${won ? 'won' : 'lost'}`}>{teamScore}</span>
        <span className="match-score-sep">:</span>
        <span className={`match-score-enemy ${won ? 'lost' : 'won'}`}>{enemyScore}</span>
      </div>

      <div className="match-stats-grid">
        <div className="match-stat-cell">
          <div className="match-stat-value">{kills} / {deaths} / {assists}</div>
          <div className="match-stat-label">K / D / A</div>
        </div>
        <div className="match-stat-cell">
          <div className="match-stat-value">{kd}</div>
          <div className="match-stat-label">K/D</div>
        </div>
        <div className="match-stat-cell">
          <div className="match-stat-value">{hsrPct}%</div>
          <div className="match-stat-label">HS%</div>
        </div>
        <div className="match-stat-cell">
          <div className="match-stat-value" style={{ color: ratingColor(rating) }}>
            {rating.toFixed(2)}
          </div>
          <div className="match-stat-label">Rating</div>
        </div>
      </div>
    </div>
  );
}

function SeriesScoreCard({
  score,
  won,
  kind,
  label,
}: {
  score: { player: number; opponent: number };
  won: boolean;
  kind?: 'map' | 'break' | 'final' | 'series';
  label?: string;
}) {
  return (
    <div className="series-score-strip">
      <div className="series-score-head">
        <span className="series-score-label">
          {kind === 'break' ? '中场休息' : kind === 'final' ? '系列赛结算' : '系列赛比分'}
        </span>
        {label && <span className="series-score-map">{label}</span>}
      </div>
      <div className="series-score-value">
        <span className={`series-score-team ${won ? 'won' : 'lost'}`}>{score.player}</span>
        <span className="series-score-sep">-</span>
        <span className={`series-score-team ${won ? 'lost' : 'won'}`}>{score.opponent}</span>
      </div>
    </div>
  );
}
