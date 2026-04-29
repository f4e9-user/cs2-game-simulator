import type { RoundResult, StatKey } from '@/lib/types';
import {
  EVENT_TYPE_LABELS,
  describeFeelChange,
  describeTiltChange,
  describeFatigueChange,
  describeStressChange,
  describeFameChange,
  describeStatChange,
  describeBuffAdded,
} from '@/lib/format';

interface Props {
  history: RoundResult[];
}

export function FeedPanel({ history }: Props) {
  const rows = [...history].reverse().slice(0, 20);

  if (rows.length === 0) {
    return (
      <>
        <div className="feed-section-title">动态</div>
        <div style={{ padding: '12px', fontSize: 11, color: 'var(--fg-3)' }}>
          还没有记录
        </div>
      </>
    );
  }

  return (
    <>
      <div className="feed-section-title">动态</div>
      {rows.map((r) => {
        const deltas = Object.entries(r.statChanges) as [StatKey, number][];
        const buffsAdded = r.buffsAdded ?? [];
        const stressChange = r.stressChange ?? 0;
        const fameChange = r.fameChange ?? 0;
        const feelChange = r.feelChange ?? 0;
        const tiltChange = r.tiltChange ?? 0;
        const fatigueChange = r.fatigueChange ?? 0;
        const hasDeltas =
          deltas.length > 0 ||
          buffsAdded.length > 0 ||
          stressChange !== 0 ||
          fameChange !== 0 ||
          feelChange !== 0 ||
          tiltChange !== 0 ||
          fatigueChange !== 0;
        return (
          <div className="feed-item" key={`${r.round}-${r.eventId}`}>
            <div className="feed-item-top">
              <span className="feed-round-tag">R{r.round}</span>
              <span
                className={`event-type-badge ${r.eventType}`}
                style={{ fontSize: 9, padding: '1px 5px' }}
              >
                {EVENT_TYPE_LABELS[r.eventType]}
              </span>
              <span className="feed-title">{r.eventTitle}</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: r.success ? 'var(--success)' : 'var(--danger)',
                  flexShrink: 0,
                }}
              >
                {r.success ? '✓' : '✗'}
              </span>
            </div>
            <div className="feed-choice">→ {r.choiceLabel}</div>
            <div className="feed-narrative">{r.narrative}</div>
            {hasDeltas && (
              <div className="feed-deltas">
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
      })}
    </>
  );
}
