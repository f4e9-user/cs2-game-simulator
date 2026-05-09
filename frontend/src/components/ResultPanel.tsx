import type { MatchStats, RoundResult, StatKey } from '@/lib/types';
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
} from '@/lib/format';

export function ResultPanel({ result }: { result: RoundResult }) {
  const deltas = Object.entries(result.statChanges) as [StatKey, number][];
  const stageChanged = result.stageBefore !== result.stageAfter;
  const passives = result.passiveEffects ?? [];
  const qualificationChanges = result.qualificationChanges ?? [];
  const buffsAdded = result.buffsAdded ?? [];
  const stressChange = result.stressChange ?? 0;
  const fameChange = result.fameChange ?? 0;
  const feelChange = result.feelChange ?? 0;
  const tiltChange = result.tiltChange ?? 0;
  const fatigueChange = result.fatigueChange ?? 0;
  const ok = result.success;
  const tier = result.resultTier;
  const isCrit = tier === 'critical_success' || tier === 'critical_failure';
  const isMatch = Boolean(result.matchStats);

  const hasChips =
    deltas.length > 0 ||
    stageChanged ||
    buffsAdded.length > 0 ||
    stressChange !== 0 ||
    fameChange !== 0 ||
    feelChange !== 0 ||
    tiltChange !== 0 ||
    fatigueChange !== 0;

  return (
    <div className={`result-panel ${ok ? 'ok' : 'fail'}${isCrit ? ' crit' : ''}`}>
      <div className="result-meta">
        <span className={`result-badge ${tier ?? (ok ? 'success' : 'failure')}`}>
          {tier === 'critical_success' ? '大成功' :
           tier === 'critical_failure' ? '大失败' :
           ok ? '胜' : '败'}
        </span>
        {isMatch ? (
          <span className="result-roll" style={{ color: 'var(--fg-2)' }}>
            Rating {result.matchStats!.rating.toFixed(2)} · 难度 {result.dc}
          </span>
        ) : (
          <span className="result-roll">
            {result.roll} vs DC {result.dc}
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

      {/* 比赛数据卡片 */}
      {result.matchStats && <MatchStatsCard stats={result.matchStats} won={ok} />}

      <div className="result-narrative">{result.narrative}</div>

      {passives.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {passives.map((p) => (
            <div key={p} style={{ fontSize: 11, color: 'var(--danger)' }}>
              · {PASSIVE_EFFECT_LABELS[p] ?? p}
            </div>
          ))}
        </div>
      )}

      {qualificationChanges.length > 0 && (
        <QualificationResultCard changes={qualificationChanges} />
      )}

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

function MatchStatsCard({ stats, won }: { stats: MatchStats; won: boolean }) {
  const { kills, deaths, assists, headshotRate, rating, teamScore, enemyScore } = stats;
  const kd = (kills / deaths).toFixed(2);
  const hsrPct = Math.round(headshotRate * 100);

  return (
    <div className="match-stats-card">
      {/* 比分行 */}
      <div className="match-score-row">
        <span className={`match-score-team ${won ? 'won' : 'lost'}`}>{teamScore}</span>
        <span className="match-score-sep">:</span>
        <span className={`match-score-enemy ${won ? 'lost' : 'won'}`}>{enemyScore}</span>
      </div>

      {/* 数据行 */}
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
