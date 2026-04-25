import type { GameEvent } from '@/lib/types';
import { EVENT_TYPE_LABELS } from '@/lib/format';

export function EventCard({ event }: { event: GameEvent }) {
  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span className="badge accent">{EVENT_TYPE_LABELS[event.type]}</span>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{event.title}</div>
      </div>
      <div className="narrative">{event.narrative}</div>
    </div>
  );
}
