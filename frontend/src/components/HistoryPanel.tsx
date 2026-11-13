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

  const groups = groupHistory(history).reverse();

  return (
      <div className="panel">
      <div className="panel-title">历史记录</div>
      {groups.map((group) => (
        <div
          className="history-row"
          key={group.key}
          style={group.sequenceId ? { borderColor: 'rgba(88,166,255,0.28)' } : undefined}
        >
          {group.sequenceId && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#58a6ff', fontWeight: 600 }}>
              流程记录 · {group.sequenceType} · {group.items.length} 步
            </div>
          )}
          {group.items.map((r, index) => {
            const deltas = Object.entries(r.statChanges) as [StatKey, number][];
            const stepLabel = r.sequenceId
              ? `步骤 ${r.sequenceStepIndex ?? index + 1}/${r.sequenceStepCount ?? group.items.length}`
              : null;
        return (
          <div
            key={`${r.round}-${r.eventId}-${index}`}
            style={index > 0 ? { borderTop: '1px solid #21262d', marginTop: 10, paddingTop: 10 } : undefined}
          >
            <div className="history-meta">
              <span>回合 {r.round}</span>
              {stepLabel && <span>· {stepLabel}</span>}
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
      ))}
    </div>
  );
}

function groupHistory(history: RoundResult[]): Array<{
  key: string;
  sequenceId?: string;
  sequenceType?: string;
  items: RoundResult[];
}> {
  const groups: Array<{
    key: string;
    sequenceId?: string;
    sequenceType?: string;
    items: RoundResult[];
  }> = [];

  for (const item of history) {
    const previous = groups.at(-1);
    if (item.sequenceId && previous?.sequenceId === item.sequenceId) {
      previous.items.push(item);
      continue;
    }
    groups.push({
      key: item.sequenceId ?? `${item.round}-${item.eventId}-${groups.length}`,
      sequenceId: item.sequenceId,
      sequenceType: item.sequenceType,
      items: [item],
    });
  }

  return groups;
}
