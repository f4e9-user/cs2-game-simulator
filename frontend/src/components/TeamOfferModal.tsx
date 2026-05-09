'use client';

import type { TeamOffer } from '@/lib/types';

const TIER_LABELS: Record<string, string> = {
  youth: '青训',
  'semi-pro': '半职业',
  pro: '职业',
  top: '顶级',
};

const PRIZE_SPLIT: Record<string, number> = {
  youth: 85,
  'semi-pro': 70,
  pro: 60,
  top: 50,
};

interface Props {
  offer: TeamOffer;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

export function TeamOfferModal({ offer, onAccept, onDecline, loading }: Props) {
  const playerCut = PRIZE_SPLIT[offer.tier] ?? 50;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 360 }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginBottom: 4,
          }}>
            战队邀请
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.2 }}>
            {offer.clubName}
            <span style={{ color: 'var(--fg-2)', fontWeight: 400, fontSize: 14, marginLeft: 6 }}>
              [{offer.tag}]
            </span>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 16,
        }}>
          <div style={{
            background: 'var(--bg-2)',
            borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 3 }}>档位</div>
            <span className="badge success" style={{ fontSize: 12 }}>
              {TIER_LABELS[offer.tier] ?? offer.tier}
            </span>
          </div>
          <div style={{
            background: 'var(--bg-2)',
            borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 3 }}>地区</div>
            <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{offer.region}</div>
          </div>
          <div style={{
            background: 'var(--bg-2)',
            borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 3 }}>月薪</div>
            <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
              +{offer.weeklySalary * 10}K / 回合
            </div>
          </div>
          <div style={{
            background: 'var(--bg-2)',
            borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 3 }}>奖金分成</div>
            <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>
              你得 <span style={{ color: 'var(--success)' }}>{playerCut}%</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="ghost-button"
            onClick={onDecline}
            disabled={loading}
            style={{ flex: 1 }}
          >
            暂时拒绝
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onAccept}
            disabled={loading}
            style={{ flex: 2 }}
          >
            {loading ? '处理中…' : '确认加入 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
