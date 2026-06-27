import { getTournament } from '../data/tournaments.js';
import type { EventDef, GameSession, Player } from '../types.js';
import { createTournamentSeriesSequence } from './tournamentSeries.js';
import { matchBuffsForScope } from './matchBuffs.js';

export function buildSequencePromptEvent(
  id: string,
  type: EventDef['type'],
  title: string,
  narrative: string,
): EventDef {
  return {
    id,
    type,
    title,
    narrative,
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'continue',
        label: '继续',
        description: '继续处理这段事件。',
        check: { primary: 'mentality', dc: 0 },
        success: { narrative },
        failure: { narrative },
      },
    ],
  };
}

export function createNarrativeSequence(
  sequenceId: string,
  type: NonNullable<GameSession['activeEventSequence']>['type'],
  startedRound: number,
  steps: EventDef[],
): NonNullable<GameSession['activeEventSequence']> {
  return {
    id: sequenceId,
    type,
    currentIndex: 0,
    startedRound,
    mustCompleteInCurrentRound: true,
    status: 'active',
    context: {},
    steps: steps.map((generatedEvent, index) => ({
      id: `step-${index + 1}`,
      generatedEvent,
      completeSequenceAfter: index === steps.length - 1,
    })),
  };
}

export function createAiSequenceFromEvent(
  event: EventDef,
  startedRound: number,
): NonNullable<GameSession['activeEventSequence']> | null {
  const raw = event as unknown as {
    sequenceType?: string;
    steps?: Array<{
      title?: string;
      narrative?: string;
      choices?: EventDef['choices'];
    }>;
    maxSteps?: number;
  };
  if (!raw.sequenceType || !Array.isArray(raw.steps) || raw.steps.length === 0) return null;
  if (!['family-crisis', 'team-conflict', 'tournament-context'].includes(raw.sequenceType)) return null;
  const maxSteps = Math.min(Math.max(raw.maxSteps ?? raw.steps.length, 1), 4);
  const generatedSteps = raw.steps.slice(0, maxSteps).map((step, index) => ({
    ...event,
    id: `${event.id}-step-${index + 1}`,
    title: step.title || `${event.title} ${index + 1}`,
    narrative: step.narrative || event.narrative,
    choices: Array.isArray(step.choices) && step.choices.length > 0 ? step.choices : event.choices,
  }));
  return createNarrativeSequence(
    `ai-sequence-${event.id}-${startedRound}`,
    raw.sequenceType as NonNullable<GameSession['activeEventSequence']>['type'],
    startedRound,
    [...generatedSteps, event],
  );
}

export function restoreTournamentSeriesSequenceFromEvent(
  currentEventId: string,
  player: Player,
): NonNullable<GameSession['activeEventSequence']> | null {
  const mapMatch = /^tournament-series-(.+)-(\d+)-map-(\d+)$/.exec(currentEventId);
  const breakMatch = /^tournament-series-(.+)-(\d+)-break-(\d+)$/.exec(currentEventId);
  const finalMatch = /^tournament-(.+)--(\d+)$/.exec(currentEventId);
  const match = mapMatch ?? breakMatch ?? finalMatch;
  if (!match) return null;

  const tournamentId = match[1]!;
  const stageIndex = parseInt(match[2]!, 10);
  const tournament = getTournament(tournamentId);
  const stage = tournament?.bracket[stageIndex];
  if (!tournament || !stage || (stage.seriesType !== 'bo3' && stage.seriesType !== 'bo5')) return null;

  const sequence = createTournamentSeriesSequence(
    tournament,
    stageIndex,
    matchBuffsForScope(player.buffs ?? [], 'series'),
  );
  // 按事件 id 直接定位步骤索引：map 与 break 交错后，map-N 不再固定在 N-1，
  // 用 findIndex 比硬算偏移更稳健，也天然支持中场（break）步骤的还原。
  const currentIndex = sequence.steps.findIndex(
    (step) => step.generatedEvent?.id === currentEventId,
  );
  if (currentIndex < 0 || currentIndex >= sequence.steps.length) return null;

  const currentStep = sequence.steps[currentIndex];
  const currentEvent = currentStep?.generatedEvent;
  if (!currentStep || !currentEvent || currentEvent.id !== currentEventId) return null;

  return {
    ...sequence,
    currentIndex,
  };
}
