'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Player, ShopItem } from '@/lib/types';
import { formatMoney } from '@/lib/format';

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
}

export function ShopPanel({ sessionId, player, onPlayerUpdate }: Props) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastBoughtId, setLastBoughtId] = useState<string | null>(null);
  const [lastNarrative, setLastNarrative] = useState<string | null>(null);
  const [lastNarrativePositive, setLastNarrativePositive] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listShopItems()
      .then((res) => !cancelled && setItems(res.items))
      .catch(() => {})
      .finally(() => !cancelled && setLoadingItems(false));
    return () => { cancelled = true; };
  }, []);

  const PERIPHERAL_PRICES = [50, 80, 120, 200]; // K 单位，与后端 ×10 对应

  const buy = async (itemId: string) => {
    setBusyId(itemId);
    setError(null);
    setLastBoughtId(null);
    setLastNarrative(null);
    setLastNarrativePositive(null);
    try {
      const res = await api.buyShopItem(sessionId, itemId);
      onPlayerUpdate(res.player);
      setLastBoughtId(itemId);
      if (res.shopNarrative) {
        setLastNarrative(res.shopNarrative);
        setLastNarrativePositive(res.shopNarrativePositive ?? false);
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

  const getDisplayPrice = (item: ShopItem): number => {
    if (item.id === 'pro-peripherals') {
      const tier = player.peripheralTier ?? 0;
      return PERIPHERAL_PRICES[tier] ?? 0;
    }
    return item.priceMoney * 10;
  };

  const canBuy = (item: ShopItem): { ok: boolean; reason?: string } => {
    if (item.id === 'pro-peripherals') {
      const tier = player.peripheralTier ?? 0;
      if (tier >= PERIPHERAL_PRICES.length) return { ok: false, reason: '外设已满级' };
      const price = (PERIPHERAL_PRICES[tier] ?? 0) / 10;
      if (player.stats.money < price) return { ok: false, reason: `资金不足（需 ${PERIPHERAL_PRICES[tier]}K）` };
      return { ok: true };
    }
    if (player.stats.money < item.priceMoney) {
      return { ok: false, reason: `资金不足（需 ${item.priceMoney * 10}K）` };
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

  // Group items by category
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
    <div className="shop-panel">
      <div className="shop-panel-header">
        <span>商店</span>
        <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>
          余额 {formatMoney(player.stats.money)}
        </span>
      </div>

      {categories.map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        if (catItems.length === 0) return null;
        return (
          <div key={cat} className="shop-category">
            <div className="shop-category-label">{CATEGORY_LABELS[cat]}</div>
            {catItems.map((item) => {
              const { ok, reason } = canBuy(item);
              const justBought = lastBoughtId === item.id;
              return (
                <div key={item.id} className={`shop-item ${!ok ? 'disabled' : ''}`}>
                  <div className="shop-item-main">
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
                  {justBought && (
                    <div className="shop-item-result">
                      {lastNarrative ? (
                        <>
                          <span className="shop-item-result-ok">✓ 已购买</span>
                          <span
                            className={`shop-item-result-narrative ${lastNarrativePositive ? 'positive' : 'negative'}`}
                          >
                            {lastNarrative}
                          </span>
                        </>
                      ) : (
                        <span className="shop-item-result-ok">✓ 购买成功</span>
                      )}
                    </div>
                  )}
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
  );
}
