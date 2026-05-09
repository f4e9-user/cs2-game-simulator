'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Player, ShopItem } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { PawnConfirmModal } from './PawnConfirmModal';

const CATEGORY_LABELS: Record<string, string> = {
  consumable: '消耗品',
  service: '服务',
  equipment: '装备',
  social: '社交',
};

// 购买后弹框的物品
const MODAL_ITEMS = new Set(['pro-peripherals', 'team-dinner', 'fan-meetup']);

interface ShopModal {
  itemName: string;
  narrative: string;
  positive: boolean;
}

interface Props {
  sessionId: string;
  player: Player;
  onPlayerUpdate: (p: Player) => void;
}

export function ShopPanel({ sessionId, player, onPlayerUpdate }: Props) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shopModal, setShopModal] = useState<ShopModal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPawn, setShowPawn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listShopItems()
      .then((res) => !cancelled && setItems(res.items))
      .catch(() => {})
      .finally(() => !cancelled && setLoadingItems(false));
    return () => { cancelled = true; };
  }, []);

  const PERIPHERAL_PRICES = [30, 60, 100, 150];

  const buy = async (itemId: string) => {
    setBusyId(itemId);
    setError(null);
    try {
      const res = await api.buyShopItem(sessionId, itemId);
      onPlayerUpdate(res.player);
      if (MODAL_ITEMS.has(itemId)) {
        setShopModal({
          itemName: res.itemName,
          narrative: res.shopNarrative ?? '一切顺利，没有意外发生。',
          positive: res.shopNarrativePositive ?? !res.shopNarrative,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const round = player.round;
  const cooldowns = player.shopCooldowns ?? {};

  const TOURNAMENT_LOCKED_ITEMS = new Set(['team-dinner', 'fan-meetup', 'short-trip']);

  const hasPawnableItems = () => {
    const pawned = new Set(player.pawnedItemIds ?? []);
    const owned = player.ownedItems ?? [];
    return (owned.includes('ergo-chair') && !pawned.has('ergo-chair')) ||
      (owned.includes('pro-peripherals') && !pawned.has('pro-peripherals') && (player.peripheralTier ?? 0) > 0);
  };

  const getDisplayPrice = (item: ShopItem): number => {
    if (item.id === 'pro-peripherals') {
      return PERIPHERAL_PRICES[player.peripheralTier ?? 0] ?? 0;
    }
    return item.priceMoney;
  };

  const canBuy = (item: ShopItem): { ok: boolean; reason?: string } => {
    if (item.id === 'pro-peripherals') {
      const tier = player.peripheralTier ?? 0;
      if (tier >= PERIPHERAL_PRICES.length) return { ok: false, reason: '外设已满级' };
      const price = PERIPHERAL_PRICES[tier] ?? 0;
      if (player.stats.money < price) return { ok: false, reason: `资金不足（需 ${price}K）` };
      return { ok: true };
    }
    if (player.stats.money < item.priceMoney) {
      return { ok: false, reason: `资金不足（需 ${item.priceMoney}K）` };
    }
    const cdUntil = cooldowns[item.id] ?? 0;
    if (cdUntil > round) {
      return { ok: false, reason: `冷却中（${cdUntil - round} 回合后可用）` };
    }
    if (item.requireFame !== undefined && (player.fame ?? 0) < item.requireFame) {
      return { ok: false, reason: `名气不足（需 ${item.requireFame}）` };
    }
    if (item.requireStage && !item.requireStage.includes(player.stage)) {
      return { ok: false, reason: '当前阶段不可用' };
    }
    if (player.pendingMatch && TOURNAMENT_LOCKED_ITEMS.has(item.id)) {
      return { ok: false, reason: '赛事进行中，无法执行此行动' };
    }
    return { ok: true };
  };

  const categories = ['consumable', 'service', 'equipment', 'social'] as const;

  if (loadingItems) {
    return (
      <div className="shop-panel">
        <div className="shop-panel-header">商店</div>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', padding: '6px 0' }}>加载中…</div>
      </div>
    );
  }

  return (
    <>
      <div className="shop-panel">
        <div className="shop-panel-header">
          <span>商店</span>
          <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>
            余额 {formatMoney(player.stats.money)}
          </span>
          {hasPawnableItems() && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowPawn(true)}
              style={{ fontSize: 10, padding: '2px 8px', color: 'var(--warn)' }}
            >
              典当
            </button>
          )}
        </div>

        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          if (catItems.length === 0) return null;
          return (
            <div key={cat} className="shop-category">
              <div className="shop-category-label">{CATEGORY_LABELS[cat]}</div>
              {catItems.map((item) => {
                const { ok, reason } = canBuy(item);
                return (
                  <div key={item.id} className={`shop-item ${!ok ? 'disabled' : ''}`}>
                    <div className="shop-item-info">
                      <div className="shop-item-name">{item.name}</div>
                      <div className="shop-item-desc">{item.description}</div>
                      {!ok && reason && (
                        <div className="shop-item-reason">{reason}</div>
                      )}
                    </div>
                    <div className="shop-item-right">
                      <div className="shop-item-price">
                        {item.id === 'pro-peripherals' && (player.peripheralTier ?? 0) >= PERIPHERAL_PRICES.length
                          ? '满级'
                          : `${getDisplayPrice(item)}K`}
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={!ok || busyId !== null}
                        onClick={() => buy(item.id)}
                        style={{ fontSize: 10, padding: '2px 8px' }}
                      >
                        {busyId === item.id ? '…' : '购买'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {error && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
            {error}
          </div>
        )}
      </div>

      {showPawn && (
        <PawnConfirmModal
          sessionId={sessionId}
          player={player}
          onClose={(updatedPlayer) => {
            onPlayerUpdate(updatedPlayer);
            setShowPawn(false);
          }}
        />
      )}

      {/* 购买结果弹框 */}
      {shopModal && (
        <div className="modal-backdrop" onClick={() => setShopModal(null)}>
          <div className="modal shop-result-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shop-result-modal-tag">
              {shopModal.positive ? '购买成功' : '意外发生'}
            </div>
            <div className="shop-result-modal-title">{shopModal.itemName}</div>
            <div
              className="shop-result-modal-narrative"
              style={{ color: shopModal.positive ? 'var(--success)' : 'var(--warn)' }}
            >
              {shopModal.narrative}
            </div>
            <button
              type="button"
              className="primary-button"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => setShopModal(null)}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </>
  );
}
