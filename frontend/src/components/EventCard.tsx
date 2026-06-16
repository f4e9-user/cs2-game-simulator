import type { EventSequence, GameEvent } from '@/lib/types';
import { EVENT_TYPE_LABELS } from '@/lib/format';
import { TypewriterText } from '@/components/TypewriterText';

interface Props {
  event: GameEvent;
  sequence?: EventSequence | null;
}

export function EventCard({ event, sequence }: Props) {
  const isAiEvent = event.id.startsWith('ai-');
  const activeStep = sequence?.status === 'active'
    ? `${sequence.currentIndex + 1} / ${sequence.steps.length}`
    : null;

  return (
    <div className="event-panel">
      <div className="event-header">
        <span className={`event-type-badge ${event.type}`}>
          {EVENT_TYPE_LABELS[event.type]}
        </span>
        {isAiEvent && (
          <span className="event-ai-badge">AI</span>
        )}
        {activeStep && (
          <span className="event-ai-badge">流程中 {activeStep}</span>
        )}
        <span className="event-title">{event.title}</span>
      </div>
      <div className="narrative">
        <TypewriterText text={event.narrative} />
      </div>
    </div>
  );
}
