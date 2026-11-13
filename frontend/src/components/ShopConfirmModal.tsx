'use client';

import { useEffect } from 'react';
import { formatMoney, formatTag } from '@/lib/format';
import type { Player, ShopItem, ShopNegativeEvent } from '@/lib/types';

interface Props {
  item: ShopItem;
  price: number;
  player: Player;
  onConfirm: () => void;
  onCancel: () => void;
}

interface EffectChip {
  label: string;
  variant: 'up' | 'down' | 'neu' | 'buff';
}

function parseEffectChips(item: ShopItem): EffectChip[] {
  const e = item.effect;
  if (!e) return [];

  const chips: EffectChip[] = [];

  if (e.fatigueDelta !== undefined) {
    const v = Math.round(e.fatigueDelta);
    const sign = v >= 0 ? '+' : '';
    // fatigue up = bad (down), fatigue down = good (up)
    const variant = e.fatigueDelta > 0 ? 'down' : e.fatigueDelta < 0 ? 'up' : 'neu';
    chips.push({ label: `疲劳 ${sign}${v}`, variant });
  }

  if (e.stressDelta !== undefined) {
    const v = Math.round(e.stressDelta);
    const sign = v >= 0 ? '+' : '';
    // stress up = bad (down), stress down = good (up)
    const variant = e.stressDelta > 0 ? 'down' : e.stressDelta < 0 ? 'up' : 'neu';
    chips.push({ label: `压力 ${sign}${v}`, variant });
  }

  if (e.fameDelta !== undefined) {
    const v = Math.round(e.fameDelta);
    const sign = v >= 0 ? '+' : '';
    // fame up = good (up), fame down = bad (down)
    const variant = e.fameDelta > 0 ? 'up' : e.fameDelta < 0 ? 'down' : 'neu';
    chips.push({ label: `名气 ${sign}${v}`, variant });
  }

  if (e.constitutionDelta !== undefined) {
    const v = Math.round(e.constitutionDelta);
    const sign = v >= 0 ? '+' : '';
    // constitution up = good (up), down = bad (down)
    const variant = e.constitutionDelta > 0 ? 'up' : e.constitutionDelta < 0 ? 'down' : 'neu';
    chips.push({ label: `体能 ${sign}${v}`, variant });
  }

  if (e.mentalityDelta !== undefined) {
    const v = Math.round(e.mentalityDelta);
    const sign = v >= 0 ? '+' : '';
    const variant = e.mentalityDelta > 0 ? 'up' : e.mentalityDelta < 0 ? 'down' : 'neu';
    chips.push({ label: `心态 ${sign}${v}`, variant });
  }

  if (e.moneyDelta !== undefined) {
    const v = Math.round(e.moneyDelta);
    const sign = v >= 0 ? '+' : '';
    const variant = e.moneyDelta > 0 ? 'up' : e.moneyDelta < 0 ? 'down' : 'neu';
    chips.push({ label: `资金 ${sign}${v}K`, variant });
  }

  if (e.feelReset) {
    chips.push({ label: '手感归零', variant: 'neu' });
  }

  if (e.buffAdd) {
    chips.push({ label: `获得增益: ${e.buffAdd.label}`, variant: 'buff' });
  }

  if (e.buffRemoveId) {
    chips.push({ label: '移除增益', variant: 'neu' });
  }

  if (e.tagAdd) {
    chips.push({ label: `获得标签: ${formatTag(e.tagAdd)}`, variant: 'neu' });
  }

  if (e.tagRemove) {
    chips.push({ label: `移除标签: ${formatTag(e.tagRemove)}`, variant: 'neu' });
  }

  return chips;
}

export function ShopConfirmModal({ item, price, player, onConfirm, onCancel }: Props) {
  const effectChips = parseEffectChips(item);
  const negativeEvents = item.negativeEvents ?? [];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onConfirm();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, onConfirm]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--fg-2)',
          marginBottom: 4,
        }}>
          商店
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>
            确认购买 {item.name}
          </div>
          <span className="badge accent" style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            {formatMoney(price)}
          </span>
        </div>

        <div style={{
          fontSize: 14,
          color: 'var(--fg-2)',
          lineHeight: 1.6,
          marginBottom: 16,
        }}>
          {item.description}
        </div>

        {effectChips.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--fg-2)',
              marginBottom: 8,
            }}>
              效果预览
            </div>
            <div className="chips-row">
              {effectChips.map((chip, i) => (
                <span
                  key={i}
                  className={`chip chip-${chip.variant}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {negativeEvents.length > 0 && (
          <div style={{
            background: 'rgba(210, 153, 34, 0.08)',
            border: '1px solid rgba(210, 153, 34, 0.25)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--warn)',
              marginBottom: 8,
            }}>
              ⚠ 可能发生的意外
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {negativeEvents.map((ev: ShopNegativeEvent, i: number) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: 'var(--fg-2)',
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--warn)',
                    background: 'rgba(210, 153, 34, 0.15)',
                    padding: '1px 6px',
                    borderRadius: 3,
                    marginRight: 6,
                  }}>
                    {Math.round(ev.chance * 100)}% 概率
                  </span>
                  {ev.narrative}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="ghost-button"
            onClick={onCancel}
            style={{ flex: 1 }}
          >
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onConfirm}
            style={{ flex: 2 }}
          >
            确认购买
          </button>
        </div>
      </div>
    </div>
  );
}
