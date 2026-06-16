'use client';

import { useEffect } from 'react';
import { formatTag } from '@/lib/format';
import type { Player } from '@/lib/types';

interface Props {
  itemName: string;
  shopNarrative?: string;
  shopNarrativePositive?: boolean;
  shopBuffLabelsAdded?: string[];
  shopBuffLabelsRemoved?: string[];
  shopTagsAdded?: string[];
  shopTagsRemoved?: string[];
  prevPlayer: Player;
  newPlayer: Player;
  onClose: () => void;
}

interface StatDiff {
  label: string;
  value: number;
  invertColor?: boolean; // when true, negative = good (green), positive = bad (red)
}

function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function diffChip(diff: StatDiff) {
  const isPositive = diff.value > 0;
  const isNegative = diff.value < 0;
  const isZero = diff.value === 0;

  if (isZero) return null;

  const good = diff.invertColor ? isNegative : isPositive;
  const cls = isZero ? 'chip-neu' : good ? 'chip-up' : 'chip-down';

  return (
    <span key={diff.label} className={`chip ${cls}`}>
      {diff.label} {formatSigned(diff.value)}
    </span>
  );
}

export function ShopResultModal({
  itemName,
  shopNarrative,
  shopNarrativePositive,
  shopBuffLabelsAdded,
  shopBuffLabelsRemoved,
  shopTagsAdded,
  shopTagsRemoved,
  prevPlayer,
  newPlayer,
  onClose,
}: Props) {
  const narrative = shopNarrative || '购买成功。';
  const isNegative = shopNarrativePositive === false;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const diffs: StatDiff[] = [
    { label: '资金', value: newPlayer.stats.money - prevPlayer.stats.money },
    { label: '压力', value: (newPlayer.stress ?? 0) - (prevPlayer.stress ?? 0), invertColor: true },
    { label: '疲劳', value: (newPlayer.volatile?.fatigue ?? 0) - (prevPlayer.volatile?.fatigue ?? 0), invertColor: true },
    { label: '手感', value: (newPlayer.volatile?.feel ?? 0) - (prevPlayer.volatile?.feel ?? 0) },
    { label: '名气', value: (newPlayer.fame ?? 0) - (prevPlayer.fame ?? 0) },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: isNegative ? 'var(--warn)' : 'var(--success)',
          marginBottom: 4,
        }}>
          购买结果
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginBottom: 12 }}>
          {itemName}
        </div>

        <div style={{
          fontSize: 13,
          color: isNegative ? 'var(--warn)' : 'var(--fg)',
          background: isNegative ? 'rgba(255, 183, 77, 0.08)' : 'var(--bg-2)',
          padding: '8px 10px',
          borderRadius: 6,
          marginBottom: 14,
          lineHeight: 1.5,
        }}>
          {isNegative && '⚠ '}
          {narrative}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 6, fontWeight: 600 }}>
            属性变化
          </div>
          <div className="chips-row">
            {diffs.map(diffChip)}
          </div>
        </div>

        {(shopBuffLabelsAdded?.length || shopBuffLabelsRemoved?.length) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 6, fontWeight: 600 }}>
              增益变化
            </div>
            <div className="chips-row">
              {shopBuffLabelsAdded?.map((label) => (
                <span key={`+${label}`} className="chip chip-up">
                  增益 +{label}
                </span>
              ))}
              {shopBuffLabelsRemoved?.map((label) => (
                <span key={`-${label}`} className="chip chip-down">
                  增益 -{label}
                </span>
              ))}
            </div>
          </div>
        )}

        {(shopTagsAdded?.length || shopTagsRemoved?.length) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 6, fontWeight: 600 }}>
              标签变化
            </div>
            <div className="chips-row">
              {shopTagsAdded?.map((tag) => (
                <span key={`+${tag}`} className="chip chip-buff" title={tag}>
                  标签 +{formatTag(tag)}
                </span>
              ))}
              {shopTagsRemoved?.map((tag) => (
                <span key={`-${tag}`} className="chip chip-down" title={tag}>
                  标签 -{formatTag(tag)}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="primary-button"
          onClick={onClose}
          style={{ width: '100%' }}
        >
          知道了
        </button>
      </div>
    </div>
  );
}
