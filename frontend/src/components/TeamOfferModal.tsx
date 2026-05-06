'use client';

import type { TeamOffer } from '@/lib/types';

const TIER_LABELS: Record<string, string> = {
  youth: '青训',
  'semi-pro': '半职业',
  pro: '职业',
  top: '顶级',
};

interface Props {
  offer: TeamOffer;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

export function TeamOfferModal({ offer, onAccept, onDecline, loading }: Props) {
  const PRIZE_SPLIT: Record<string, number> = {
    youth: 85,
    'semi-pro': 70,
    pro: 60,
    top: 50,
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🏆</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>收到战队邀请</div>
        </div>

        <div style={{
          background: 'var(--bg-2)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--fg-2)' }}>俱乐部</span>
            <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{offer.clubName} [{offer.tag}]</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--fg-2)' }}>档位</span>
            <span className="badge success" style={{ fontSize: 11 }}>{TIER_LABELS[offer.tier] ?? offer.tier}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--fg-2)' }}>地区</span>
            <span style={{ color: 'var(--fg)' }}>{offer.region}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--fg-2)' }}>周薪</span>
            <span style={{ color: 'var(--up)', fontWeight: 600 }}>+{offer.weeklySalary * 10}K/回合</span>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 12, lineHeight: 1.5 }}>
          加入后你将代表该战队参加联赛。俱乐部将从赛事奖金中抽取{' '}
          {100 - (PRIZE_SPLIT[offer.tier] ?? 50)}%。你实际获得{' '}
          {PRIZE_SPLIT[offer.tier] ?? 50}%。
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            type="button"
            className="ghost-button"
            onClick={onDecline}
            disabled={loading}
          >
            暂时拒绝
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onAccept}
            disabled={loading}
          >
            {loading ? '处理中…' : '确认加入 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
