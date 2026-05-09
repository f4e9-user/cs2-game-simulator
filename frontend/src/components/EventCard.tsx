import type { GameEvent } from '@/lib/types';
import { EVENT_TYPE_LABELS } from '@/lib/format';
import { TypewriterText } from '@/components/TypewriterText';

interface Props {
  event: GameEvent;
  /** true while LLM personalization is in-flight; shows skeleton instead of raw default text */
  personalizing?: boolean;
}

export function EventCard({ event, personalizing }: Props) {
  return (
    <div className="event-panel">
      <div className="event-header">
        <span className={`event-type-badge ${event.type}`}>
          {EVENT_TYPE_LABELS[event.type]}
        </span>
        <span className="event-title">{event.title}</span>
      </div>
      {personalizing ? (
        <div className="narrative-skeleton" aria-busy="true" />
      ) : (
        <div className="narrative">
          <TypewriterText text={event.narrative} />
        </div>
      )}
    </div>
  );
}
