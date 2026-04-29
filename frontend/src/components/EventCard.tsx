import type { GameEvent } from '@/lib/types';
import { EVENT_TYPE_LABELS } from '@/lib/format';

export function EventCard({ event }: { event: GameEvent }) {
  return (
    <div className="event-panel">
      <div className="event-header">
        <span className={`event-type-badge ${event.type}`}>
          {EVENT_TYPE_LABELS[event.type]}
        </span>
        <span className="event-title">{event.title}</span>
      </div>
      <div className="narrative">{event.narrative}</div>
    </div>
  );
}
