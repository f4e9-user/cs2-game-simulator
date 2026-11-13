import { getEventById } from '../data/events/index.js';
import type {
  EventDef,
  EventSequence,
  EventSequenceCondition,
  EventSequenceStep,
  Player,
  RoundResult,
} from '../types.js';

export interface EventSequenceAdvanceResult {
  sequence?: EventSequence;
  nextStep?: EventSequenceStep;
  nextStepEvent?: EventDef;
  completed: boolean;
  cancelled: boolean;
  cancelReason?: string;
}

export type SequenceEventResolver = (eventId: string) => EventDef | null | undefined;

export function getCurrentSequenceStep(sequence: EventSequence): EventSequenceStep | null {
  if (sequence.status !== 'active') return null;
  return sequence.steps[sequence.currentIndex] ?? null;
}

export function isSequenceFinalStep(sequence: EventSequence): boolean {
  const step = getCurrentSequenceStep(sequence);
  if (!step) return true;
  return step.completeSequenceAfter === true || sequence.currentIndex >= sequence.steps.length - 1;
}

export function resolveSequenceStepEvent(
  sequence: EventSequence,
  resolver: SequenceEventResolver = getEventById,
): EventDef | null {
  const step = getCurrentSequenceStep(sequence);
  if (!step) return null;
  return resolveSequenceEventForStep(step, resolver);
}

export function resolveSequenceEventForStep(
  step: EventSequenceStep,
  resolver: SequenceEventResolver = getEventById,
): EventDef | null {
  if (step.generatedEvent) return step.generatedEvent;
  if (step.eventId) return resolver(step.eventId) ?? null;
  return null;
}

export function advanceEventSequence(
  sequence: EventSequence,
  result: RoundResult,
  player?: Player,
  resolver: SequenceEventResolver = getEventById,
): EventSequenceAdvanceResult {
  if (sequence.status !== 'active') {
    return { completed: sequence.status === 'completed', cancelled: sequence.status === 'cancelled' };
  }

  const current = getCurrentSequenceStep(sequence);
  if (!current) {
    return {
      sequence: cancelEventSequence(sequence, 'missing-current-step'),
      completed: false,
      cancelled: true,
      cancelReason: 'missing-current-step',
    };
  }

  if (current.completeSequenceAfter === true) {
    return {
      sequence: { ...sequence, status: 'completed' },
      completed: true,
      cancelled: false,
    };
  }

  let nextIndex = sequence.currentIndex + 1;
  while (nextIndex < sequence.steps.length) {
    const nextStep = sequence.steps[nextIndex]!;
    if (shouldSkipStep(nextStep, sequence, result, player)) {
      nextIndex += 1;
      continue;
    }

    const nextStepEvent = resolveSequenceEventForStep(nextStep, resolver);
    if (!nextStepEvent) {
      if (nextStep.optional) {
        nextIndex += 1;
        continue;
      }
      const cancelReason = `missing-step-event:${nextStep.id}`;
      return {
        sequence: cancelEventSequence(sequence, cancelReason),
        completed: false,
        cancelled: true,
        cancelReason,
      };
    }

    const nextSequence = {
      ...sequence,
      currentIndex: nextIndex,
      status: 'active' as const,
    };
    return {
      sequence: nextSequence,
      nextStep,
      nextStepEvent,
      completed: false,
      cancelled: false,
    };
  }

  return {
    sequence: { ...sequence, status: 'completed' },
    completed: true,
    cancelled: false,
  };
}

export function cancelEventSequence(sequence: EventSequence, reason: string): EventSequence {
  return {
    ...sequence,
    status: 'cancelled',
    cancelReason: reason,
  };
}

export function sequenceResultFields(sequence: EventSequence): Pick<
  RoundResult,
  'sequenceId' | 'sequenceType' | 'sequenceStepIndex' | 'sequenceStepCount' | 'sequenceFinal'
> {
  return {
    sequenceId: sequence.id,
    sequenceType: sequence.type,
    sequenceStepIndex: sequence.currentIndex + 1,
    sequenceStepCount: sequence.steps.length,
    sequenceFinal: isSequenceFinalStep(sequence),
  };
}

export function sequenceStepKind(sequence: EventSequence): 'map' | 'break' | 'final' | undefined {
  const step = getCurrentSequenceStep(sequence);
  if (!step || sequence.type !== 'tournament-series') return undefined;
  if (step.dynamicEventKind === 'tournament-map') return 'map';
  if (step.dynamicEventKind === 'tournament-break') return 'break';
  if (step.dynamicEventKind === 'tournament-series-decider') return 'final';
  return undefined;
}

function shouldSkipStep(
  step: EventSequenceStep,
  sequence: EventSequence,
  result: RoundResult,
  player?: Player,
): boolean {
  if (!step.skipIf) return false;
  return conditionMatches(step.skipIf, sequence, result, player);
}

function conditionMatches(
  condition: EventSequenceCondition,
  sequence: EventSequence,
  result: RoundResult,
  player?: Player,
): boolean {
  switch (condition.kind) {
    case 'series-score-reached': {
      const playerMapWins = Number(sequence.context.playerMapWins ?? 0);
      const opponentMapWins = Number(sequence.context.opponentMapWins ?? 0);
      return playerMapWins >= condition.wins || opponentMapWins >= condition.wins;
    }
    case 'context-flag':
      return sequence.context[condition.key] === condition.value;
    case 'player-tag':
      return Boolean(player?.tags.includes(condition.tag));
    case 'player-missing-tag':
      return !player?.tags.includes(condition.tag);
    default:
      return Boolean(result.sequenceFinal);
  }
}
