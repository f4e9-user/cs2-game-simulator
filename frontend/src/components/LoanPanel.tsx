'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';
import { formatMoney } from '@/lib/format';
import type { Loan, Player } from '@/lib/types';

interface Props {
  sessionId: string;
  player: Player;
  onPlayerUpdate: (p: Player) => void;
}

const BANK_MIN = 20;
const BANK_MAX = 100;
const BANK_STEP = 5;
const BANK_LOAN_TERMS = [
  { rounds: 4, interestRate: 0.10 },
  { rounds: 8, interestRate: 0.18 },
  { rounds: 12, interestRate: 0.28 },
] as const;

const FRIEND_MIN = 10;
const FRIEND_MAX = 30;
const FRIEND_STEP = 5;

function CreditBar({ score }: { score: number }) {
  const color = score >= 70 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171';
  const label = score >= 70 ? '良好' : score >= 50 ? '一般' : '过低';
  return (
    <div className="credit-bar-wrapper">
      <div className="credit-bar-header">
        <span>信用值</span>
        <span style={{ color, fontWeight: 600 }}>{score} / 100 · {label}</span>
      </div>
      <div className="credit-bar-track">
        <div
          className="credit-bar-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      {score < 50 && (
        <div className="credit-warning">
          信用值过低：银行贷款和朋友借款均已关闭，只有家人仍会救济你
        </div>
      )}
    </div>
  );
}

export function LoanPanel({ sessionId, player, onPlayerUpdate }: Props) {
  const apiToken = useGameStore((s) => s.apiToken);
  const [busyBank, setBusyBank] = useState(false);
  const [busyFriend, setBusyFriend] = useState(false);
  const [errorBank, setErrorBank] = useState<string | null>(null);
  const [errorFriend, setErrorFriend] = useState<string | null>(null);
  const [bankAmount, setBankAmount] = useState(BANK_MIN);
  const [bankDuration, setBankDuration] = useState(4);
  const [friendAmount, setFriendAmount] = useState(FRIEND_MIN);

  const creditScore = player.creditScore ?? 100;
  const crisis = player.pendingFamilyCrisis;

  const activeBankLoan = (player.loans ?? []).find(
    (l) => (l.source ?? 'bank') === 'bank' && !l.paid && !l.defaulted,
  );
  const activeFriendLoan = (player.loans ?? []).find(
    (l) => l.source === 'friend' && !l.paid && !l.defaulted,
  );

  const canBorrowBank =
    !activeBankLoan &&
    creditScore >= 50 &&
    player.stage !== 'rookie' &&
    player.stage !== 'retired';

  const canBorrowFriend =
    !activeFriendLoan &&
    creditScore >= 50 &&
    player.stage !== 'rookie' &&
    player.stage !== 'retired';

  const handleBorrowBank = async () => {
    setBusyBank(true);
    setErrorBank(null);
    try {
      const res = await api.takeLoan(sessionId, bankAmount, bankDuration, apiToken ?? undefined);
      onPlayerUpdate(res.player);
    } catch (e) {
      setErrorBank(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyBank(false);
    }
  };

  const handleBorrowFriend = async () => {
    setBusyFriend(true);
    setErrorFriend(null);
    try {
      const res = await api.takeFriendLoan(sessionId, friendAmount, apiToken ?? undefined);
      onPlayerUpdate(res.player);
    } catch (e) {
      setErrorFriend(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyFriend(false);
    }
  };

  const showPanel =
    crisis ||
    activeBankLoan ||
    activeFriendLoan ||
    canBorrowBank ||
    canBorrowFriend ||
    (player.stage !== 'rookie' && creditScore < 100);
  const selectedBankTerm = BANK_LOAN_TERMS.find((term) => term.rounds === bankDuration) ?? BANK_LOAN_TERMS[0];

  if (!showPanel) return null;

  return (
    <div className="loan-panel">
      <CreditBar score={creditScore} />

      {/* 家人危机倒计时 */}
      {crisis && (
        <div className="family-crisis-banner">
          <div className="crisis-title">家人手术费危机</div>
          <div className="crisis-body">
            需要在第 <strong>{crisis.deadlineRound}</strong> 回合前凑够{' '}
            <strong>{formatMoney(crisis.amountNeeded)}</strong>
            {player.round < crisis.deadlineRound && (
              <span className="crisis-countdown">
                （剩余 {crisis.deadlineRound - player.round} 回合）
              </span>
            )}
            {player.round >= crisis.deadlineRound && (
              <span className="crisis-overdue">（已到期）</span>
            )}
          </div>
          <div className="crisis-hint">
            账户余额达到 {formatMoney(crisis.amountNeeded)} 时将在回合结算时自动扣除
          </div>
        </div>
      )}

      {/* 银行贷款 */}
      <div className="loan-panel-header">
        <span>银行贷款</span>
        {activeBankLoan && <span className="loan-status-badge">还款中</span>}
      </div>
      {activeBankLoan ? (
        <LoanDetails loan={activeBankLoan} currentRound={player.round} />
      ) : canBorrowBank ? (
        <div className="loan-borrow">
          <div className="loan-borrow-hint">
            {BANK_MIN}K – {BANK_MAX}K · 期限越长利率越高
          </div>
          <div className="loan-slider-row">
            <input
              type="range"
              min={BANK_MIN}
              max={BANK_MAX}
              step={BANK_STEP}
              value={bankAmount}
              onChange={(e) => setBankAmount(Number(e.target.value))}
              className="loan-slider"
            />
            <span className="loan-amount-display">{formatMoney(bankAmount)}</span>
          </div>
          <div className="loan-slider-row">
            {BANK_LOAN_TERMS.map((term) => (
              <button
                key={term.rounds}
                type="button"
                className={bankDuration === term.rounds ? 'primary-button' : 'ghost-button'}
                onClick={() => setBankDuration(term.rounds)}
                style={{ flex: 1, padding: '4px 6px', fontSize: 11 }}
              >
                {term.rounds}回合 · {Math.round(term.interestRate * 100)}%
              </button>
            ))}
          </div>
          <div className="loan-repay-preview">
            到期需还 {formatMoney(Math.floor(bankAmount * (1 + selectedBankTerm.interestRate)))}
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={busyBank}
            onClick={handleBorrowBank}
            style={{ width: '100%', marginTop: 8 }}
          >
            {busyBank ? '处理中…' : '申请贷款'}
          </button>
          {errorBank && <div className="loan-error">{errorBank}</div>}
        </div>
      ) : !activeBankLoan && creditScore < 50 ? (
        <div className="loan-blocked">信用值过低，银行已拒绝贷款申请</div>
      ) : null}

      {/* 朋友借款 */}
      <div className="loan-panel-header" style={{ marginTop: 12 }}>
        <span>找朋友借款</span>
        {activeFriendLoan && <span className="loan-status-badge friend">还款中</span>}
      </div>
      {activeFriendLoan ? (
        <LoanDetails loan={activeFriendLoan} currentRound={player.round} labelOverride="朋友借款" />
      ) : canBorrowFriend ? (
        <div className="loan-borrow">
          <div className="loan-borrow-hint">
            {FRIEND_MIN}K – {FRIEND_MAX}K · 无利息 · 8 回合后还款
          </div>
          <div className="loan-borrow-hint" style={{ color: '#94a3b8', fontSize: '0.85em' }}>
            违约将损失信用值 -15，关系受损
          </div>
          <div className="loan-slider-row">
            <input
              type="range"
              min={FRIEND_MIN}
              max={FRIEND_MAX}
              step={FRIEND_STEP}
              value={friendAmount}
              onChange={(e) => setFriendAmount(Number(e.target.value))}
              className="loan-slider"
            />
            <span className="loan-amount-display">{formatMoney(friendAmount)}</span>
          </div>
          <div className="loan-repay-preview">
            到期需还 {formatMoney(friendAmount)}（无利息）
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={busyFriend}
            onClick={handleBorrowFriend}
            style={{ width: '100%', marginTop: 8 }}
          >
            {busyFriend ? '处理中…' : '向朋友借款'}
          </button>
          {errorFriend && <div className="loan-error">{errorFriend}</div>}
        </div>
      ) : !activeFriendLoan && creditScore < 50 ? (
        <div className="loan-blocked">信用值过低，朋友已无力再借钱给你</div>
      ) : null}
    </div>
  );
}

function LoanDetails({
  loan,
  currentRound,
  labelOverride,
}: {
  loan: Loan;
  currentRound: number;
  labelOverride?: string;
}) {
  const totalDue = Math.floor(loan.remainingPrincipal * (1 + loan.interestRate));
  return (
    <div className="loan-active">
      <div className="loan-details">
        <div className="loan-row">
          <span className="loan-label">本金</span>
          <span className="loan-value">{formatMoney(loan.principal)}</span>
        </div>
        {loan.interestRate > 0 && (
          <div className="loan-row">
            <span className="loan-label">利息</span>
            <span className="loan-value">{Math.round(loan.interestRate * 100)}%</span>
          </div>
        )}
        {loan.durationRounds && (
          <div className="loan-row">
            <span className="loan-label">期限</span>
            <span className="loan-value">{loan.durationRounds} 回合</span>
          </div>
        )}
        <div className="loan-row">
          <span className="loan-label">应还总额</span>
          <span className="loan-value loan-due">{formatMoney(totalDue)}</span>
        </div>
        <div className="loan-row">
          <span className="loan-label">到期回合</span>
          <span className="loan-value">
            第 {loan.dueRound} 回合
            {loan.dueRound <= currentRound && (
              <span className="loan-overdue">（已到期）</span>
            )}
            {loan.dueRound > currentRound && (
              <span className="loan-remaining">（剩余 {loan.dueRound - currentRound} 回合）</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
