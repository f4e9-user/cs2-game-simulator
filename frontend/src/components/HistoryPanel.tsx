import type { RoundResult, StatKey } from '@/lib/types';
import { EVENT_TYPE_LABELS, STAT_LABELS, formatDelta } from '@/lib/format';

export function HistoryPanel({ history }: { history: RoundResult[] }) {
  if (history.length === 0) {
    return (
      <div className="panel">
        <div className="panel-title">历史记录</div>
        <div className="stat-desc">还没有事件记录。</div>
      </div>
    );
  }

  const rows = [...history].reverse();

  return (
    <div className="panel">
      <div className="panel-title">历史记录</div>
      {rows.map((r) => {
        const deltas = Object.entries(r.statChanges) as [StatKey, number][];
        return (
          <div className="history-row" key={`${r.round}-${r.eventId}`}>
            <div className="history-meta">
              <span>回合 {r.round}</span>
              <span>· {EVENT_TYPE_LABELS[r.eventType]}</span>
              <span>· {r.eventTitle}</span>
              <span className={`badge ${r.success ? 'success' : 'danger'}`}>
                {r.success ? '成功' : '失败'}
              </span>
            </div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              <span style={{ color: 'var(--fg-dim)' }}>你选择：</span>
              {r.choiceLabel}
            </div>
            <div className="narrative" style={{ fontSize: 14 }}>
              {r.narrative}
            </div>
            {deltas.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {deltas.map(([k, v]) => (
                  <span
                    key={k}
                    className={`delta-chip ${v >= 0 ? 'up' : 'down'}`}
                  >
                    {STAT_LABELS[k]} {formatDelta(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
