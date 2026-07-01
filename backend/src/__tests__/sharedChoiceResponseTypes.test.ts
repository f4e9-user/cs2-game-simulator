import { describe, expect, it } from 'vitest';
import type { ChoiceResponse } from '../../../shared/types';

function consumeSharedChoiceResponse(response: ChoiceResponse) {
  return {
    phase: response.phase,
    queuedEvents: response.queuedEvents?.length ?? 0,
    weeklyNews: response.weeklyNews?.length ?? 0,
    careerInsight: response.careerInsight,
    activeTournamentInstance: response.activeTournamentInstance,
    tournamentHistory: response.tournamentHistory?.length ?? 0,
  };
}

describe('shared choice response types', () => {
  it('exposes the fields returned by the game choice API', () => {
    expect(consumeSharedChoiceResponse).toBeTypeOf('function');
  });
});
