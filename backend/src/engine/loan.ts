import type { Loan, Player } from '../types.js';
import { applyMoneyTransaction } from './money.js';
import { uuid } from './utils.js';

export function applyForLoan(player: Player, amount: number): { success: boolean; message?: string; loan?: Loan } {
  if (!Number.isInteger(amount) || amount < 20 || amount > 100) {
    return { success: false, message: '借款金额必须是 20K 到 100K 的整数' };
  }
  if (player.stage === 'rookie') {
    return { success: false, message: '至少进入青训阶段后才能申请贷款' };
  }
  if ((player.creditScore ?? 100) < 50) {
    return { success: false, message: '信用值过低（< 50），银行拒绝贷款申请' };
  }
  const hasActiveBankLoan = (player.loans ?? []).some((l) => (l.source ?? 'bank') === 'bank' && !l.paid && !l.defaulted);
  if (hasActiveBankLoan) {
    return { success: false, message: '已有未结清银行贷款，不能重复借款' };
  }

  const loan: Loan = {
    id: uuid(),
    source: 'bank',
    principal: amount,
    interestRate: 0.10,
    remainingPrincipal: amount,
    issuedRound: player.round,
    dueRound: player.round + 12,
    paid: false,
    defaulted: false,
  };

  player.loans = [...(player.loans ?? []), loan];
  applyMoneyTransaction(player, amount);

  return { success: true, loan };
}

export function applyFriendLoan(player: Player, amount: number): { success: boolean; message?: string; loan?: Loan } {
  if (!Number.isInteger(amount) || amount < 10 || amount > 30) {
    return { success: false, message: '朋友借款金额必须是 10K 到 30K 的整数' };
  }
  if (player.stage === 'rookie') {
    return { success: false, message: '至少进入青训阶段后才能向朋友借款' };
  }
  if ((player.creditScore ?? 100) < 50) {
    return { success: false, message: '信用值过低（< 50），朋友已无力再借钱给你了' };
  }
  const hasActiveFriendLoan = (player.loans ?? []).some((l) => l.source === 'friend' && !l.paid && !l.defaulted);
  if (hasActiveFriendLoan) {
    return { success: false, message: '已有未还清的朋友借款，不能再借' };
  }

  const loan: Loan = {
    id: uuid(),
    source: 'friend',
    principal: amount,
    interestRate: 0,
    remainingPrincipal: amount,
    issuedRound: player.round,
    dueRound: player.round + 8,
    paid: false,
    defaulted: false,
  };

  player.loans = [...(player.loans ?? []), loan];
  applyMoneyTransaction(player, amount);

  return { success: true, loan };
}

export function processLoanRepayment(player: Player, effects?: string[]): void {
  const activeLoans = (player.loans ?? []).filter((loan) => !loan.paid && !loan.defaulted);

  const dueLoans = activeLoans
    .filter((loan) => player.round >= loan.dueRound)
    .sort((a, b) => a.dueRound - b.dueRound);

  for (const loan of dueLoans) {
    const totalDue = Math.floor(loan.remainingPrincipal * (1 + loan.interestRate));
    const loanSource = loan.source ?? 'bank';
    if (player.stats.money >= totalDue) {
      applyMoneyTransaction(player, -totalDue);
      loan.paid = true;
      loan.remainingPrincipal = 0;
      const label = loanSource === 'friend' ? '朋友借款已还清' : '贷款还款';
      effects?.push(`${label} -${totalDue}K`);
    } else {
      loan.defaulted = true;
      if (loanSource === 'friend') {
        player.creditScore = Math.max(0, (player.creditScore ?? 100) - 15);
        effects?.push('朋友借款违约！信用值-15，关系受损');
      } else {
        player.fame = Math.max(0, (player.fame ?? 0) - 10);
        player.creditScore = Math.max(0, (player.creditScore ?? 100) - 20);
        if (!player.tags.includes('loan-default')) player.tags.push('loan-default');
        if (!player.tags.includes('transfer-ban')) player.tags.push('transfer-ban');
        player.tagExpiry = {
          ...(player.tagExpiry ?? {}),
          'transfer-ban': player.round + 12,
        };
        effects?.push('贷款违约！名气-10，信用值-20，转会禁止12回合');
      }
    }
  }
}
