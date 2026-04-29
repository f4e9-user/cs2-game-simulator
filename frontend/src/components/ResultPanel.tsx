import type { RoundResult, StatKey } from '@/lib/types';
import {
  HUD_STAT_LABELS,
  PASSIVE_EFFECT_LABELS,
  STAGE_LABELS,
  formatDelta,
} from '@/lib/format';

export function ResultPanel({ result }: { result: RoundResult }) {
  const deltas = Object.entries(result.statChanges) as [StatKey, number][];
  const stageChanged = result.stageBefore !== result.stageAfter;
  const passives = result.passiveEffects ?? [];
  const stressChange = result.stressChange ?? 0;
  const fameChange = result.fameChange ?? 0;
  const ok = result.success;

  return (
    <div className={`result-panel ${ok ? 'ok' : 'fail'}`}>
      <div className="result-meta">
        <span className={`result-badge ${ok ? 'ok' : 'fail'}`}>
          {ok ? '成功' : '失败'}
        </span>
        <span className="result-roll">
          {result.roll} vs DC {result.dc}
        </span>
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

      {(deltas.length > 0 ||
        stageChanged ||
        result.tagsAdded.length > 0 ||
        stressChange !== 0 ||
        fameChange !== 0) && (
        <div className="chips-row">
          {stageChanged && (
            <span className="chip chip-up">
              {STAGE_LABELS[result.stageBefore]} → {STAGE_LABELS[result.stageAfter]}
            </span>
          )}
          {deltas.map(([k, v]) => (
            <span key={k} className={`chip ${v >= 0 ? 'chip-up' : 'chip-down'}`}>
              {HUD_STAT_LABELS[k]} {formatDelta(v)}
            </span>
          ))}
          {stressChange !== 0 && (
            <span className={`chip ${stressChange > 0 ? 'chip-down' : 'chip-up'}`}>
              压力 {formatDelta(stressChange)}
            </span>
          )}
          {fameChange !== 0 && (
            <span className={`chip ${fameChange >= 0 ? 'chip-up' : 'chip-down'}`}>
              名气 {formatDelta(fameChange)}
            </span>
          )}
          {result.tagsAdded.map((t) => (
            <span key={t} className="chip chip-neu">
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
