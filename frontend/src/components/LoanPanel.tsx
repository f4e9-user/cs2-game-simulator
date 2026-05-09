'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Loan, Player } from '@/lib/types';

interface Props {
  sessionId: string;
  player: Player;
  onPlayerUpdate: (p: Player) => void;
}

const LOAN_MIN = 20;
const LOAN_MAX = 100;
const LOAN_STEP = 5;
const INTEREST_RATE = 0.10;
const LOAN_DURATION = 4; // rounds

export function LoanPanel({ sessionId, player, onPlayerUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrowAmount, setBorrowAmount] = useState(LOAN_MIN);

  const activeLoan = (player.loans ?? []).find((l) => !l.paid && !l.defaulted);
  const canBorrow =
    !activeLoan &&
    player.stage !== 'rookie' &&
    player.stage !== 'retired';

  const handleBorrow = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.takeLoan(sessionId, borrowAmount);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!canBorrow && !activeLoan) {
    return null;
  }

  return (
    <div className="loan-panel">
      <div className="loan-panel-header">
        <span>贷款</span>
      </div>

      {activeLoan ? (
        <div className="loan-active">
          <div className="loan-status-badge">还款中</div>
          <div className="loan-details">
            <div className="loan-row">
              <span className="loan-label">本金</span>
              <span className="loan-value">{formatMoney(activeLoan.principal)}</span>
            </div>
            <div className="loan-row">
              <span className="loan-label">利息</span>
              <span className="loan-value">{Math.round(activeLoan.interestRate * 100)}%</span>
            </div>
            <div className="loan-row">
              <span className="loan-label">应还总额</span>
              <span className="loan-value loan-due">
                {formatMoney(Math.floor(activeLoan.remainingPrincipal * (1 + activeLoan.interestRate)))}
              </span>
            </div>
            <div className="loan-row">
              <span className="loan-label">剩余本金</span>
              <span className="loan-value">{formatMoney(activeLoan.remainingPrincipal)}</span>
            </div>
            <div className="loan-row">
              <span className="loan-label">到期回合</span>
              <span className="loan-value">
                第 {activeLoan.dueRound} 回合
                {activeLoan.dueRound <= player.round && (
                  <span className="loan-overdue">（已到期）</span>
                )}
                {activeLoan.dueRound > player.round && (
                  <span className="loan-remaining">
                    （剩余 {activeLoan.dueRound - player.round} 回合）
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="loan-borrow">
          <div className="loan-borrow-hint">
            借款范围：{LOAN_MIN}K – {LOAN_MAX}K，利率 {Math.round(INTEREST_RATE * 100)}%，{LOAN_DURATION} 回合后还款
          </div>
          <div className="loan-slider-row">
            <input
              type="range"
              min={LOAN_MIN}
              max={LOAN_MAX}
              step={LOAN_STEP}
              value={borrowAmount}
              onChange={(e) => setBorrowAmount(Number(e.target.value))}
              className="loan-slider"
            />
            <span className="loan-amount-display">{formatMoney(borrowAmount)}</span>
          </div>
          <div className="loan-repay-preview">
            到期需还 {formatMoney(Math.floor(borrowAmount * (1 + INTEREST_RATE)))}
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={handleBorrow}
            style={{ width: '100%', marginTop: 8 }}
          >
            {busy ? '处理中…' : '借款'}
          </button>
        </div>
      )}

      {error && (
        <div className="loan-error">{error}</div>
      )}
    </div>
  );
}
