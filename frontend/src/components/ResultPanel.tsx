import type { RoundResult, StatKey } from '@/lib/types';
import {
  PASSIVE_EFFECT_LABELS,
  STAGE_LABELS,
  STAT_LABELS,
  formatDelta,
} from '@/lib/format';

export function ResultPanel({ result }: { result: RoundResult }) {
  const deltas = Object.entries(result.statChanges) as [StatKey, number][];
  const stageChanged = result.stageBefore !== result.stageAfter;
  const passives = result.passiveEffects ?? [];
  const stressChange = result.stressChange ?? 0;
  const fameChange = result.fameChange ?? 0;

  return (
    <div className="panel">
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span className={`badge ${result.success ? 'success' : 'danger'}`}>
          {result.success ? '成功' : '失败'}
        </span>
        <span className="badge">
          判定 {result.roll} vs DC {result.dc}
        </span>
        <span className="badge">
          上一选：{result.choiceLabel}
        </span>
      </div>

      <div className="narrative" style={{ marginBottom: 12 }}>
        {result.narrative}
      </div>

      {passives.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {passives.map((p) => (
            <div key={p} className="error">
              · {PASSIVE_EFFECT_LABELS[p] ?? p}
            </div>
          ))}
        </div>
      )}

      {(deltas.length > 0 ||
        stageChanged ||
        result.tagsAdded.length > 0 ||
        stressChange !== 0 ||
        fameChange !== 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {stageChanged && (
            <span className="delta-chip up">
              阶段：{STAGE_LABELS[result.stageBefore]} → {STAGE_LABELS[result.stageAfter]}
            </span>
          )}
          {deltas.map(([k, v]) => (
            <span key={k} className={`delta-chip ${v >= 0 ? 'up' : 'down'}`}>
              {STAT_LABELS[k]} {formatDelta(v)}
            </span>
          ))}
          {stressChange !== 0 && (
            <span
              className={`delta-chip ${stressChange > 0 ? 'down' : 'up'}`}
            >
              压力 {formatDelta(stressChange)}
            </span>
          )}
          {fameChange !== 0 && (
            <span
              className={`delta-chip ${fameChange >= 0 ? 'up' : 'down'}`}
            >
              名气 {formatDelta(fameChange)}
            </span>
          )}
          {result.tagsAdded.map((t) => (
            <span key={t} className="delta-chip">
              新标签 #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
