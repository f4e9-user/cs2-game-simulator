import { describe, expect, it } from 'vitest';
import { initPlayer } from '../gameEngine.js';
import { applyForLoan } from '../loan.js';
import type { Player } from '../../types.js';

function loanPlayer(overrides: Partial<Player> = {}): Player {
  return {
    ...initPlayer({
      name: 'LoanTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    }),
    stage: 'youth',
    round: 20,
    creditScore: 80,
    loans: [],
    ...overrides,
  };
}

describe('loan rules', () => {
  it('lets players choose repayment duration with higher interest for longer terms', () => {
    const short = applyForLoan(loanPlayer(), 40, 4);
    const medium = applyForLoan(loanPlayer(), 40, 8);
    const long = applyForLoan(loanPlayer(), 40, 12);

    expect(short.loan).toMatchObject({ principal: 40, interestRate: 0.10, issuedRound: 20, dueRound: 24 });
    expect(medium.loan).toMatchObject({ principal: 40, interestRate: 0.18, issuedRound: 20, dueRound: 28 });
    expect(long.loan).toMatchObject({ principal: 40, interestRate: 0.28, issuedRound: 20, dueRound: 32 });
  });

  it('rejects unsupported bank loan durations', () => {
    const result = applyForLoan(loanPlayer(), 40, 16);

    expect(result.success).toBe(false);
    expect(result.message).toContain('还款期限');
  });
});
