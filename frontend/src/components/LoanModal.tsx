'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Player } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  player: Player;
  onPlayerUpdate: (p: Player) => void;
}

const LOAN_MIN = 20;
const LOAN_MAX = 100;
const LOAN_STEP = 20;
const INTEREST_RATE = 0.10;
const LOAN_DURATION = 4;

const AMOUNT_OPTIONS = [20, 40, 60, 80, 100];

export function LoanModal({ open, onClose, sessionId, player, onPlayerUpdate }: Props) {
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
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const totalDue = activeLoan
    ? Math.floor(activeLoan.remainingPrincipal * (1 + activeLoan.interestRate))
    : 0;
  const overdue = activeLoan ? player.round >= activeLoan.dueRound : false;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 320, padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--fg-3)',
            marginBottom: 12,
          }}
        >
          贷款
        </div>

        {activeLoan ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className="badge danger">负债 {formatMoney(totalDue)}</span>
              <span className="badge">{overdue ? '逾期' : `${activeLoan.dueRound - player.round}回合到期`}</span>
              <span className="badge">利率 {Math.round(activeLoan.interestRate * 100)}%</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              <div>剩余本金: {formatMoney(activeLoan.remainingPrincipal)}</div>
              <div>到期回合: 第 {activeLoan.dueRound} 回合</div>
            </div>
          </div>
        ) : canBorrow ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {AMOUNT_OPTIONS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={borrowAmount === amt ? 'primary-button' : 'ghost-button'}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: '4px 2px',
                  }}
                  onClick={() => setBorrowAmount(amt)}
                >
                  {amt}K
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              <div>到期需还: {formatMoney(Math.floor(borrowAmount * (1 + INTEREST_RATE)))}</div>
              <div>还款期限: {LOAN_DURATION} 回合</div>
            </div>

            {error && (
              <div style={{ fontSize: 11, color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={handleBorrow}
              style={{ width: '100%' }}
            >
              {busy ? '处理中…' : '借款'}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            当前阶段不可借款
          </div>
        )}

        <button
          type="button"
          className="ghost-button"
          onClick={onClose}
          style={{ width: '100%', marginTop: 12, fontSize: 12, padding: '4px 8px' }}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
