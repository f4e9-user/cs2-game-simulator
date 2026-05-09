'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Player } from '@/lib/types';

const PERIPHERAL_PRICES = [30, 60, 100, 150];

const ITEM_LABELS: Record<string, string> = {
  'ergo-chair': '人体工学椅',
  'pro-peripherals': '高端外设',
};

interface Props {
  sessionId: string;
  player: Player;
  onClose: (updatedPlayer: Player) => void;
}

interface PawnableItem {
  id: string;
  label: string;
  pawnValue: number;
}

function getPawnableItems(player: Player): PawnableItem[] {
  const pawned = new Set(player.pawnedItemIds ?? []);
  const owned = player.ownedItems ?? [];
  const result: PawnableItem[] = [];

  if (owned.includes('ergo-chair') && !pawned.has('ergo-chair')) {
    result.push({
      id: 'ergo-chair',
      label: '人体工学椅',
      pawnValue: Math.floor(35 * 0.6),
    });
  }

  if (owned.includes('pro-peripherals') && !pawned.has('pro-peripherals')) {
    const tier = player.peripheralTier ?? 0;
    if (tier > 0) {
      result.push({
        id: 'pro-peripherals',
        label: `高端外设（T${tier}）`,
        pawnValue: Math.floor((PERIPHERAL_PRICES[tier - 1] ?? 0) * 0.5),
      });
    }
  }

  return result;
}

export function PawnConfirmModal({ sessionId, player, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pawnable = getPawnableItems(player);
  const selectedItem = pawnable.find((i) => i.id === selected);

  const handlePawn = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.pawnItem(sessionId, selected);
      onClose(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (pawnable.length === 0) {
    return (
      <div className="modal-backdrop" onClick={() => onClose(player)}>
        <div className="modal" style={{ maxWidth: 340 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 8 }}>
            无可典当物品
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => onClose(player)}
            style={{ width: '100%' }}
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={() => onClose(player)}>
      <div className="modal pawn-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--danger)',
          marginBottom: 4,
        }}>
          典当行
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>
          选择要典当的物品
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {pawnable.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`pawn-item-row${selected === item.id ? ' selected' : ''}`}
              onClick={() => setSelected(item.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                background: selected === item.id ? 'var(--bg-3)' : 'var(--bg-2)',
                border: selected === item.id ? '1px solid var(--danger)' : '1px solid transparent',
                borderRadius: 8,
                cursor: 'pointer',
                color: 'var(--fg)',
                fontSize: 13,
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span>{item.label}</span>
              <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
                {formatMoney(item.pawnValue)}
              </span>
            </button>
          ))}
        </div>

        <div style={{
          fontSize: 11,
          color: 'var(--danger)',
          background: 'rgba(255, 59, 48, 0.08)',
          padding: '8px 10px',
          borderRadius: 6,
          marginBottom: 16,
        }}>
          ⚠ 永久失去，不可赎回
        </div>

        {error && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="ghost-button"
            onClick={() => onClose(player)}
            disabled={busy}
            style={{ flex: 1 }}
          >
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            style={{
              flex: 2,
              background: selected ? 'var(--danger)' : undefined,
            }}
            disabled={!selected || busy}
            onClick={handlePawn}
          >
            {busy ? '处理中…' : '确认典当'}
          </button>
        </div>
      </div>
    </div>
  );
}
