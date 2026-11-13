import { describe, expect, it } from 'vitest';
import { initPlayer } from '../gameEngine.js';
import { applyForLoan, applyFriendLoan, processLoanRepayment } from '../loan.js';
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

  it.each(['bank-first', 'friend-first'] as const)('keeps bank and friend borrowing independent (%s)', (order) => {
    const player = loanPlayer();
    player.stats.money = 100;

    const bank = () => applyForLoan(player, 40, 12);
    const friend = () => applyFriendLoan(player, 20);
    const first = order === 'bank-first' ? bank() : friend();
    const second = order === 'bank-first' ? friend() : bank();

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(player.stats.money).toBe(160);
    expect(player.loans).toHaveLength(2);
    expect(player.loans.find((loan) => loan.source === 'friend')).toMatchObject({
      principal: 20, remainingPrincipal: 20, interestRate: 0, issuedRound: 20, dueRound: 28,
    });
    expect(bank().success).toBe(false);
    expect(friend().success).toBe(false);
    expect(player.stats.money).toBe(160);
    expect(player.loans).toHaveLength(2);
  });

  it('repays the friend loan at eight rounds without settling the later bank loan early', () => {
    const player = loanPlayer();
    player.stats.money = 100;
    applyFriendLoan(player, 20);
    applyForLoan(player, 40, 12);
    const effects: string[] = [];

    player.round = 27;
    processLoanRepayment(player, effects);
    expect(player.stats.money).toBe(160);
    expect(effects).toEqual([]);

    player.round = 28;
    processLoanRepayment(player, effects);
    expect(player.stats.money).toBe(140);
    expect(player.loans.find((loan) => loan.source === 'friend')).toMatchObject({ paid: true, remainingPrincipal: 0 });
    expect(player.loans.find((loan) => loan.source === 'bank')).toMatchObject({ paid: false, remainingPrincipal: 40 });
    expect(effects).toEqual(['朋友借款已还清 -20K']);

    processLoanRepayment(player, effects);
    expect(player.stats.money).toBe(140);
    expect(effects).toHaveLength(1);
    player.round = 32;
    processLoanRepayment(player, effects);
    expect(player.stats.money).toBe(89);
    expect(player.loans.every((loan) => loan.paid)).toBe(true);
    expect(effects).toContain('贷款还款 -51K');
  });

  it('records a friend default once without consuming money or defaulting a later bank loan', () => {
    const player = loanPlayer();
    applyFriendLoan(player, 20);
    applyForLoan(player, 40, 12);
    player.stats.money = 5;
    player.round = 28;
    const effects: string[] = [];

    processLoanRepayment(player, effects);
    processLoanRepayment(player, effects);

    expect(player.stats.money).toBe(5);
    expect(player.creditScore).toBe(65);
    expect(player.loans.find((loan) => loan.source === 'friend')).toMatchObject({ defaulted: true, paid: false, remainingPrincipal: 20 });
    expect(player.loans.find((loan) => loan.source === 'bank')).toMatchObject({ defaulted: false, paid: false });
    expect(effects).toEqual(['朋友借款违约！信用值-15，关系受损']);
  });

  it.each([
    { stage: 'rookie' as const },
    { creditScore: 49 },
  ])('keeps friend borrowing subject to existing eligibility rules: %j', (overrides) => {
    const player = loanPlayer(overrides);
    const before = structuredClone(player);

    expect(applyFriendLoan(player, 10).success).toBe(false);
    expect(player).toEqual(before);
  });
});
