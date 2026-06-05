import type { GameEvent } from '@/lib/types';
import { EVENT_TYPE_LABELS } from '@/lib/format';
import { TypewriterText } from '@/components/TypewriterText';

interface Props {
  event: GameEvent;
}

export function EventCard({ event }: Props) {
  const isAiEvent = event.id.startsWith('ai-');

  return (
    <div className="event-panel">
      <div className="event-header">
        <span className={`event-type-badge ${event.type}`}>
          {EVENT_TYPE_LABELS[event.type]}
        </span>
        {isAiEvent && (
          <span className="event-ai-badge">AI</span>
        )}
        <span className="event-title">{event.title}</span>
      </div>
      <div className="narrative">
        <TypewriterText text={event.narrative} />
      </div>
    </div>
  );
}
