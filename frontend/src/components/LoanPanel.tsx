'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';
import { formatMoney } from '@/lib/format';
import type { Loan, Player } from '@/lib/types';
import styles from './LoanPanel.module.css';

interface Props {
  sessionId: string;
  player: Player;
  onPlayerUpdate: (p: Player) => void;
  enabled?: boolean;
}

const BANK_LOAN_TERMS = [
  { rounds: 4, interestRate: 0.10 },
  { rounds: 8, interestRate: 0.18 },
  { rounds: 12, interestRate: 0.28 },
] as const;

type LoanSource = 'bank' | 'friend';
const SOURCE_LABELS: Record<LoanSource, string> = { bank: '银行贷款', friend: '朋友借款' };

export function LoanPanel({ sessionId, player, onPlayerUpdate, enabled = true }: Props) {
  const apiToken = useGameStore((s) => s.apiToken);
  const [busySource, setBusySource] = useState<LoanSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bankAmount, setBankAmount] = useState(20);
  const [bankDuration, setBankDuration] = useState(4);
  const [friendAmount, setFriendAmount] = useState(10);

  const creditScore = player.creditScore ?? 100;
  const crisis = player.pendingFamilyCrisis;
  const loans = player.loans ?? [];
  const restriction = !enabled
    ? '当前不在行动阶段，暂不可借款'
    : (player.restRounds ?? 0) > 0
      ? '休养期间暂不可借款'
      : player.stage === 'rookie' || player.stage === 'retired'
        ? '青训及以上在役选手可申请借款'
        : creditScore < 50
          ? '信用值低于 50，暂不可向银行或朋友借款'
          : null;
  const selectedBankTerm = BANK_LOAN_TERMS.find((term) => term.rounds === bankDuration) ?? BANK_LOAN_TERMS[0];

  const handleBorrow = async (source: LoanSource) => {
    if (busySource || restriction || loans.some((loan) => (loan.source ?? 'bank') === source && !loan.paid && !loan.defaulted)) return;
    setBusySource(source);
    setError(null);
    setNotice(null);
    try {
      const res = source === 'friend'
        ? await api.takeFriendLoan(sessionId, friendAmount, apiToken ?? undefined)
        : await api.takeLoan(sessionId, bankAmount, bankDuration, apiToken ?? undefined);
      onPlayerUpdate(res.player);
      setNotice(`${SOURCE_LABELS[source]}申请成功，到期回合结算时自动还款。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusySource(null);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <span>信用值</span>
        <strong>{creditScore} / 100</strong>
      </div>
      <div className={styles.hint}>银行与朋友可各有一笔未结清借款，到期回合结算时自动扣款。</div>
      {restriction && <div className={styles.warning}>{restriction}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {error && <div className={styles.warning} role="alert">{error}</div>}
      {crisis && (
        <div className={styles.warning}>
          家人手术费：第 {crisis.deadlineRound} 回合前需准备 {formatMoney(crisis.amountNeeded)}，余额足够时在回合结算中自动扣除。
        </div>
      )}

      {(['bank', 'friend'] as const).map((source) => {
        const isFriend = source === 'friend';
        const activeLoan = loans.find((loan) => (loan.source ?? 'bank') === source && !loan.paid && !loan.defaulted);
        const lastClosedLoan = loans.slice().reverse().find((loan) => (loan.source ?? 'bank') === source && (loan.paid || loan.defaulted));
        return (
          <section key={source} className={styles.card} aria-label={SOURCE_LABELS[source]}>
            <div className={styles.row}>
              <h3 className={styles.title}>{SOURCE_LABELS[source]}</h3>
              {activeLoan && <span className="badge">待还款</span>}
            </div>
            {activeLoan ? (
              <LoanDetails loan={activeLoan} currentRound={player.round} />
            ) : (
              <>
                {lastClosedLoan && (
                  <div className={lastClosedLoan.paid ? styles.notice : styles.warning}>
                    最近一笔{SOURCE_LABELS[source]}：{lastClosedLoan.paid ? '已结清' : '已违约'}
                    · {lastClosedLoan.paid ? '本金' : '未偿本金'} {formatMoney(lastClosedLoan.paid ? lastClosedLoan.principal : lastClosedLoan.remainingPrincipal)}
                  </div>
                )}
                <div className={styles.hint}>
                  {isFriend ? '10K–30K · 无利息 · 8 回合后还款' : '20K–100K · 期限越长利率越高'}
                </div>
                <label className={styles.amount}>
                  <span>{SOURCE_LABELS[source]}金额</span>
                  <input
                    type="range"
                    min={isFriend ? 10 : 20}
                    max={isFriend ? 30 : 100}
                    step={5}
                    value={isFriend ? friendAmount : bankAmount}
                    onChange={(e) => isFriend ? setFriendAmount(Number(e.target.value)) : setBankAmount(Number(e.target.value))}
                    disabled={!!busySource || !!restriction}
                    aria-label={`${SOURCE_LABELS[source]}金额`}
                  />
                  <strong>{formatMoney(isFriend ? friendAmount : bankAmount)}</strong>
                </label>
                {!isFriend && (
                  <div className={styles.terms}>
                    {BANK_LOAN_TERMS.map((term) => (
                      <button
                        key={term.rounds}
                        type="button"
                        className={bankDuration === term.rounds ? 'primary-button' : 'ghost-button'}
                        aria-pressed={bankDuration === term.rounds}
                        disabled={!!busySource || !!restriction}
                        onClick={() => setBankDuration(term.rounds)}
                      >
                        {term.rounds}回合 · {Math.round(term.interestRate * 100)}%
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.hint}>
                  到期需还 {formatMoney(isFriend ? friendAmount : Math.floor(bankAmount * (1 + selectedBankTerm.interestRate)))}
                  {isFriend ? '（无利息）' : `（${bankDuration} 回合）`}
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!!busySource || !!restriction}
                  onClick={() => handleBorrow(source)}
                  style={{ width: '100%' }}
                >
                  {busySource === source ? '处理中…' : isFriend ? '向朋友借款' : '申请银行贷款'}
                </button>
              </>
            )}
            <div className={styles.hint}>
              {isFriend
                ? '到期余额不足会违约，信用值 -15，关系受损。'
                : '到期余额不足会违约，信用值 -20、名气 -10，并禁止转会 12 回合。'}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LoanDetails({ loan, currentRound }: { loan: Loan; currentRound: number }) {
  const totalDue = Math.floor(loan.remainingPrincipal * (1 + loan.interestRate));
  return (
    <div className={styles.details}>
      <div className={styles.row}><span>剩余本金</span><strong>{formatMoney(loan.remainingPrincipal)}</strong></div>
      <div className={styles.row}><span>利息</span><span>{loan.interestRate === 0 ? '无利息' : `${Math.round(loan.interestRate * 100)}%`}</span></div>
      <div className={styles.row}><span>期限</span><span>{loan.durationRounds ?? loan.dueRound - loan.issuedRound} 回合</span></div>
      <div className={styles.row}><span>到期需还</span><strong>{formatMoney(totalDue)}</strong></div>
      <div className={styles.row}>
        <span>到期回合</span>
        <span>第 {loan.dueRound} 回合（{loan.dueRound <= currentRound ? '已到期' : `剩余 ${loan.dueRound - currentRound} 回合`}）</span>
      </div>
      <div className={styles.hint}>到期回合结算时自动偿还。</div>
    </div>
  );
}
