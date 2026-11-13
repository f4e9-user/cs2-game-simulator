import type { Player, RoundResult } from '../types.js';

export function careerSummaryFacts(player: Player, history: RoundResult[]) {
  const events = history.filter((result) => result.eventType !== 'match');
  // A series records maps and breaks as well as its final result. Only the final
  // result represents a completed match; older single-result matches have no kind.
  const matches = history.filter((result) => result.eventType === 'match'
    && (!result.seriesStepKind || result.seriesStepKind === 'final'));
  const eventSuccesses = events.filter((result) => result.success).length;
  const matchWins = matches.filter((result) => result.success).length;
  return {
    rounds: player.round,
    eventCount: events.length,
    eventSuccesses,
    eventSuccessRate: events.length ? Math.round(eventSuccesses / events.length * 100) : null,
    matchCount: matches.length,
    matchWins,
    matchLosses: matches.length - matchWins,
    matchWinRate: matches.length ? Math.round(matchWins / matches.length * 100) : null,
  };
}
