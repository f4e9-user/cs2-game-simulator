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



interface Props {
  sessionId: string;
  player: Player;
  onPlayerUpdate: (p: Player) => void;
  onRequestLoan?: () => void;
  onShopResult?: (result: {
    itemId: string;
    itemName: string;
    shopNarrative?: string;
    shopNarrativePositive?: boolean;
    shopBuffLabelsAdded?: string[];
    shopBuffLabelsRemoved?: string[];
    shopTagsAdded?: string[];
    shopTagsRemoved?: string[];
  }) => void;
  enabled?: boolean;
  disabledReason?: string;
}

export function ShopPanel({
  sessionId,
  player,
  onPlayerUpdate,
  onRequestLoan,
  onShopResult,
  enabled = true,
  disabledReason,
}: Props) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPawn, setShowPawn] = useState(false);
  const [recentBoughtId, setRecentBoughtId] = useState<string | null>(null);

  useEffect(() => {
    if (!recentBoughtId) return;
    const timer = window.setTimeout(() => setRecentBoughtId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [recentBoughtId]);

  useEffect(() => {
    setRecentBoughtId(null);
  }, [player.round]);

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
      onShopResult?.({
        itemId,
        itemName: res.itemName,
        shopNarrative: res.shopNarrative,
        shopNarrativePositive: res.shopNarrativePositive,
        shopBuffLabelsAdded: res.shopBuffLabelsAdded,
        shopBuffLabelsRemoved: res.shopBuffLabelsRemoved,
        shopTagsAdded: res.shopTagsAdded,
        shopTagsRemoved: res.shopTagsRemoved,
      });
      setRecentBoughtId(itemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const round = player.round;
  const cooldowns = player.shopCooldowns ?? {};
  const hasAgent = player.tags.includes('has-agent');

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
    if (!enabled) {
      return { ok: false, reason: disabledReason ?? '结算中，暂不可购买' };
    }
    if (item.id === 'pro-peripherals') {
      const tier = player.peripheralTier ?? 0;
      if (tier >= PERIPHERAL_PRICES.length) return { ok: false, reason: '外设已满级' };
      const price = PERIPHERAL_PRICES[tier] ?? 0;
      if (player.stats.money < price) return { ok: false, reason: `资金不足（需 ${price}K）` };
      return { ok: true };
    }
    if (item.id === 'hire-agent' && hasAgent) {
      return { ok: false, reason: '已签约经纪人' };
    }
    if (item.id === 'fire-agent' && !hasAgent) {
      return { ok: false, reason: '当前没有经纪人' };
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
  const visibleItems = items.filter((item) => {
    if (item.id === 'hire-agent') return !hasAgent;
    if (item.id === 'fire-agent') return hasAgent;
    return true;
  });

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              余额 {formatMoney(player.stats.money)}
            </span>
            {onRequestLoan && (
              <button
                type="button"
                className="ghost-button"
                onClick={onRequestLoan}
                disabled={!enabled}
                style={{ fontSize: 10, padding: '2px 8px' }}
              >
                {(player.loans ?? []).some((l) => !l.paid && !l.defaulted) ? '查看贷款' : '贷款'}
              </button>
            )}
            {hasPawnableItems() && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowPawn(true)}
                disabled={!enabled}
                style={{ fontSize: 10, padding: '2px 8px', color: 'var(--warn)' }}
              >
                典当
              </button>
            )}
          </div>
        </div>

        {categories.map((cat) => {
          const catItems = visibleItems.filter((i) => i.category === cat);
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
                        {busyId === item.id
                          ? '…'
                          : recentBoughtId === item.id
                          ? '已购买'
                          : item.id === 'fire-agent'
                          ? '解约'
                          : '购买'}
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

    </>
  );
}
