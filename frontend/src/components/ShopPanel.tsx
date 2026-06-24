'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';
import type { HomeAssetActionId, HomeFacilityDefinition, HousingCityProfile, HousingTier, Player, ShopItem } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { ShopConfirmModal } from './ShopConfirmModal';
import { ShopResultModal } from './ShopResultModal';
import { PawnConfirmModal } from './PawnConfirmModal';

const CATEGORY_LABELS: Record<string, string> = {
  consumable: '消耗品',
  service: '服务',
  equipment: '装备',
  social: '社交',
};

const WEEKLY_SHOP_LIMITS: Partial<Record<ShopItem['category'], number>> = {
  consumable: 2,
  service: 1,
};

const HOME_ASSET_ACTIONS: Array<{
  id: HomeAssetActionId;
  label: string;
  description: string;
}> = [
  { id: 'rent-out', label: '出租', description: '获得每周租金，但增加资产管理复杂度。' },
  { id: 'stop-rental', label: '停租', description: '停止出租，保留房产自用属性。' },
  { id: 'mortgage', label: '抵押', description: '一次性获得资金，后续每周偿还。' },
  { id: 'renovate', label: '装修', description: '提升长期资产状态和房产价值。' },
  { id: 'sell', label: '卖房', description: '出售房产并搬回普通租房。' },
];

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
  const apiToken = useGameStore((s) => s.apiToken);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [housingTiers, setHousingTiers] = useState<HousingTier[]>([]);
  const [homeFacilities, setHomeFacilities] = useState<HomeFacilityDefinition[]>([]);
  const [cityProfiles, setCityProfiles] = useState<HousingCityProfile[]>([]);
  const [weeklyLivingExpense, setWeeklyLivingExpense] = useState<number>(1);
  const [loadingItems, setLoadingItems] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [housingMessage, setHousingMessage] = useState<string | null>(null);
  const [showPawn, setShowPawn] = useState(false);
  const [recentBoughtId, setRecentBoughtId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);
  const [resultData, setResultData] = useState<{
    player: Player;
    itemName: string;
    shopNarrative?: string;
    shopNarrativePositive?: boolean;
    shopBuffLabelsAdded?: string[];
    shopBuffLabelsRemoved?: string[];
    shopTagsAdded?: string[];
    shopTagsRemoved?: string[];
  } | null>(null);
  const [prevPlayerSnapshot, setPrevPlayerSnapshot] = useState<Player | null>(null);

  useEffect(() => {
    if (!recentBoughtId) return;
    const timer = window.setTimeout(() => setRecentBoughtId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [recentBoughtId]);

  useEffect(() => {
    setRecentBoughtId(null);
  }, [player.round]);

  useEffect(() => {
    if (!housingMessage) return;
    const timer = window.setTimeout(() => setHousingMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [housingMessage]);

  useEffect(() => {
    let cancelled = false;
    api
      .listShopItems()
      .then((res) => !cancelled && setItems(res.items))
      .catch(() => {})
      .finally(() => !cancelled && setLoadingItems(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listHousingTiers()
      .then((res) => {
        if (cancelled) return;
        setHousingTiers(res.tiers);
        setHomeFacilities(res.homeFacilities);
        setCityProfiles(res.cityProfiles);
        setWeeklyLivingExpense(res.weeklyLivingExpense);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const PERIPHERAL_PRICES = [30, 60, 100, 150];

  const handleBuyClick = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item || confirmItem || busyId) return;
    setPrevPlayerSnapshot(player);
    setConfirmItem(item);
    setError(null);
  };

  const handleCancelBuy = () => {
    if (busyId) return;
    setConfirmItem(null);
    setPrevPlayerSnapshot(null);
    setBusyId(null);
    setError(null);
  };

  const handleConfirmBuy = async () => {
    if (!confirmItem) return;
    setError(null);
    setBusyId(confirmItem.id);
    try {
      const res = await api.buyShopItem(sessionId, confirmItem.id, apiToken ?? undefined);
      setResultData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusyId(null);
    }
  };

  const handleHousingChange = async (tier: HousingTier) => {
    if (busyId || !enabled) return;
    setError(null);
    setHousingMessage(null);
    setBusyId(`housing:${tier.id}`);
    try {
      const res = await api.changeHousing(sessionId, tier.id, apiToken ?? undefined);
      onPlayerUpdate(res.player);
      setHousingMessage(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleFacilityUpgrade = async (facility: HomeFacilityDefinition) => {
    if (busyId || !enabled) return;
    setError(null);
    setHousingMessage(null);
    setBusyId(`home-facility:${facility.id}`);
    try {
      const res = await api.upgradeHomeFacility(sessionId, facility.id, apiToken ?? undefined);
      onPlayerUpdate(res.player);
      setHousingMessage(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleHomeAssetAction = async (actionId: HomeAssetActionId) => {
    if (busyId || !enabled) return;
    setError(null);
    setHousingMessage(null);
    setBusyId(`home-asset:${actionId}`);
    try {
      const res = await api.runHomeAssetAction(sessionId, actionId, apiToken ?? undefined);
      onPlayerUpdate(res.player);
      setHousingMessage(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleCloseResult = () => {
    if (!resultData || !prevPlayerSnapshot || !confirmItem) return;
    onPlayerUpdate(resultData.player);
    onShopResult?.({
      itemId: confirmItem.id,
      itemName: resultData.itemName,
      shopNarrative: resultData.shopNarrative,
      shopNarrativePositive: resultData.shopNarrativePositive,
      shopBuffLabelsAdded: resultData.shopBuffLabelsAdded,
      shopBuffLabelsRemoved: resultData.shopBuffLabelsRemoved,
      shopTagsAdded: resultData.shopTagsAdded,
      shopTagsRemoved: resultData.shopTagsRemoved,
    });
    setRecentBoughtId(confirmItem.id);
    setResultData(null);
    setPrevPlayerSnapshot(null);
    setConfirmItem(null);
    setBusyId(null);
  };

  const round = player.round;
  const cooldowns = player.shopCooldowns ?? {};
  const weeklyPurchases = player.weeklyShopPurchases ?? {};
  const hasAgent = player.tags.includes('has-agent');
  const isResting = (player.restRounds ?? 0) > 0;

  const TOURNAMENT_LOCKED_ITEMS = new Set(['team-dinner', 'fan-meetup', 'short-trip']);
  const OPENING_OVERFLOW_RECOVERY_TAGS = new Set([
    'opening-mental-scar',
    'opening-physical-debt',
    'opening-tactical-gap',
    'opening-mechanical-gap',
  ]);
  const hasOpeningOverflowRecoveryTag = player.tags.some((tag) => OPENING_OVERFLOW_RECOVERY_TAGS.has(tag));

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
    if (isResting) {
      return { ok: false, reason: '休养期间不能购买商店物品' };
    }
    if (item.id === 'pro-peripherals') {
      const tier = player.peripheralTier ?? 0;
      if (tier >= PERIPHERAL_PRICES.length) return { ok: false, reason: '外设已满级' };
      const price = PERIPHERAL_PRICES[tier] ?? 0;
      if (player.stats.money < price) return { ok: false, reason: `资金不足（需 ${price}K）` };
      return { ok: true };
    }
    if (item.category === 'equipment') {
      const owned = new Set(player.ownedItems ?? []);
      const pawned = new Set(player.pawnedItemIds ?? []);
      if (owned.has(item.id) && !pawned.has(item.id)) {
        return { ok: false, reason: '已经拥有该装备' };
      }
      if (pawned.has(item.id)) {
        return { ok: false, reason: '该装备已永久典当，无法重新购买' };
      }
    }
    if (item.id === 'hire-agent' && hasAgent) {
      return { ok: false, reason: '已签约经纪人' };
    }
    if (item.id === 'fire-agent' && !hasAgent) {
      return { ok: false, reason: '当前没有经纪人' };
    }
    if (item.id === 'foundation-rehab' && !hasOpeningOverflowRecoveryTag) {
      return { ok: false, reason: '仅限开局负面溢出可买' };
    }
    if (player.stats.money < item.priceMoney) {
      return { ok: false, reason: `资金不足（需 ${item.priceMoney}K）` };
    }
    const cdUntil = cooldowns[item.id] ?? 0;
    if (cdUntil > round) {
      return { ok: false, reason: `冷却中（${cdUntil - round} 回合后可用）` };
    }
    const weeklyLimit = WEEKLY_SHOP_LIMITS[item.category];
    const purchaseRecord = weeklyPurchases[item.id];
    const purchaseCount =
      purchaseRecord?.year === player.year && purchaseRecord.week === player.week
        ? purchaseRecord.count
        : 0;
    if (weeklyLimit !== undefined && purchaseCount >= weeklyLimit) {
      return { ok: false, reason: `本周已达上限（${purchaseCount}/${weeklyLimit}）` };
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
  const currentHousingTierId = player.housing?.tier ?? 'shared-housing';
  const ownedHomeAssets = player.housing?.tier === 'owned-home' ? player.housing.assets : undefined;
  const currentCity = cityProfiles.find((city) => city.id === (player.housing?.cityId ?? 'local-city'));
  const facilityLevel = (facility: HomeFacilityDefinition): number => {
    if (!ownedHomeAssets) return 0;
    if (facility.id === 'training-room') return ownedHomeAssets.facilities.trainingRoom;
    if (facility.id === 'review-room') return ownedHomeAssets.facilities.reviewRoom;
    return ownedHomeAssets.facilities.restRoom;
  };

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
              <div className="shop-category-label">
                {CATEGORY_LABELS[cat]}
                {cat === 'consumable' && <span> · 每周每种 2 次</span>}
                {cat === 'service' && <span> · 每周每种 1 次</span>}
              </div>
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
                        disabled={!ok || busyId !== null || confirmItem !== null}
                        onClick={() => handleBuyClick(item.id)}
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

        {housingTiers.length > 0 && (
          <div className="shop-category">
            <div className="shop-category-label">
              居住
              <span> · 基础生活费 {formatMoney(weeklyLivingExpense)}/周{currentCity ? ` · ${currentCity.name}` : ''}</span>
            </div>
            {housingTiers.map((tier) => {
              const active = tier.id === currentHousingTierId;
              const affordable = player.stats.money >= tier.moveCost;
              const disabled = active || !enabled || busyId !== null || !affordable;
              const reason = active
                ? '当前居住档位'
                : !enabled
                ? (disabledReason ?? '结算中，暂不可搬家')
                : !affordable
                ? `资金不足（搬家需 ${tier.moveCost}K）`
                : undefined;
              return (
                <div key={tier.id} className={`shop-item ${disabled ? 'disabled' : ''}`}>
                  <div className="shop-item-info">
                    <div className="shop-item-name">{tier.name}</div>
                    <div className="shop-item-desc">{tier.description}</div>
                    <div className="shop-item-desc">
                      周支出 {formatMoney(tier.weeklyCost)} · 疲劳 -{tier.fatigueRecovery} · 压力 -{tier.stressRecovery}
                    </div>
                    {reason && (
                      <div className="shop-item-reason">{reason}</div>
                    )}
                  </div>
                  <div className="shop-item-right">
                    <div className="shop-item-price">
                      {active ? '居住中' : `搬家 ${tier.moveCost}K`}
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={disabled}
                      onClick={() => handleHousingChange(tier)}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                    >
                      {busyId === `housing:${tier.id}` ? '…' : active ? '当前' : '搬入'}
                    </button>
                  </div>
                </div>
              );
            })}
            {currentHousingTierId === 'owned-home' && homeFacilities.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="shop-category-label">
                  房产附属功能
                  <span> · 自有房专属</span>
                </div>
                {homeFacilities.map((facility) => {
                  const level = facilityLevel(facility);
                  const maxed = level >= facility.maxLevel;
                  const affordable = player.stats.money >= facility.upgradeCost;
                  const disabled = !enabled || busyId !== null || maxed || !affordable;
                  const reason = maxed
                    ? '已完成'
                    : !enabled
                    ? (disabledReason ?? '结算中，暂不可装修')
                    : !affordable
                    ? `资金不足（需 ${facility.upgradeCost}K）`
                    : undefined;
                  return (
                    <div key={facility.id} className={`shop-item ${disabled ? 'disabled' : ''}`}>
                      <div className="shop-item-info">
                        <div className="shop-item-name">{facility.name}</div>
                        <div className="shop-item-desc">{facility.description}</div>
                        <div className="shop-item-desc">
                          每周维护 {formatMoney(facility.weeklyUpkeep)} · 疲劳 -{facility.fatigueRecovery} · 压力 -{facility.stressRecovery}
                        </div>
                        {reason && (
                          <div className="shop-item-reason">{reason}</div>
                        )}
                      </div>
                      <div className="shop-item-right">
                        <div className="shop-item-price">
                          {maxed ? '已升级' : `装修 ${facility.upgradeCost}K`}
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={disabled}
                          onClick={() => handleFacilityUpgrade(facility)}
                          style={{ fontSize: 10, padding: '2px 8px' }}
                        >
                          {busyId === `home-facility:${facility.id}` ? '…' : maxed ? '完成' : '升级'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {currentHousingTierId === 'owned-home' && (
              <div style={{ marginTop: 8 }}>
                <div className="shop-category-label">
                  长期资产
                  <span>
                    {ownedHomeAssets?.rentalActive ? ' · 出租中' : ''}
                    {(ownedHomeAssets?.mortgagePrincipal ?? 0) > 0 ? ` · 抵押 ${ownedHomeAssets?.mortgagePrincipal}K` : ''}
                    {ownedHomeAssets?.renovationLevel ? ` · 装修 ${ownedHomeAssets.renovationLevel}` : ''}
                  </span>
                </div>
                {HOME_ASSET_ACTIONS.map((action) => {
                  const rentalActive = ownedHomeAssets?.rentalActive ?? false;
                  const mortgaged = (ownedHomeAssets?.mortgagePrincipal ?? 0) > 0;
                  const unavailable =
                    (action.id === 'rent-out' && rentalActive) ||
                    (action.id === 'stop-rental' && !rentalActive) ||
                    (action.id === 'mortgage' && mortgaged);
                  const disabled = !enabled || busyId !== null || unavailable;
                  const reason = unavailable
                    ? action.id === 'rent-out'
                      ? '已经出租'
                      : action.id === 'stop-rental'
                      ? '当前未出租'
                      : '已经抵押'
                    : !enabled
                    ? (disabledReason ?? '结算中，暂不可操作')
                    : undefined;
                  return (
                    <div key={action.id} className={`shop-item ${disabled ? 'disabled' : ''}`}>
                      <div className="shop-item-info">
                        <div className="shop-item-name">{action.label}</div>
                        <div className="shop-item-desc">{action.description}</div>
                        {reason && (
                          <div className="shop-item-reason">{reason}</div>
                        )}
                      </div>
                      <div className="shop-item-right">
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={disabled}
                          onClick={() => handleHomeAssetAction(action.id)}
                          style={{ fontSize: 10, padding: '2px 8px' }}
                        >
                          {busyId === `home-asset:${action.id}` ? '…' : action.label}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
            {error}
          </div>
        )}
        {housingMessage && !error && (
          <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>
            {housingMessage}
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

      {confirmItem && !resultData && prevPlayerSnapshot && (
        <ShopConfirmModal
          item={confirmItem}
          price={getDisplayPrice(confirmItem)}
          player={player}
          onConfirm={handleConfirmBuy}
          onCancel={handleCancelBuy}
        />
      )}

      {resultData && prevPlayerSnapshot && confirmItem && (
        <ShopResultModal
          itemName={resultData.itemName}
          shopNarrative={resultData.shopNarrative}
          shopNarrativePositive={resultData.shopNarrativePositive}
          shopBuffLabelsAdded={resultData.shopBuffLabelsAdded}
          shopBuffLabelsRemoved={resultData.shopBuffLabelsRemoved}
          shopTagsAdded={resultData.shopTagsAdded}
          shopTagsRemoved={resultData.shopTagsRemoved}
          prevPlayer={prevPlayerSnapshot}
          newPlayer={resultData.player}
          onClose={handleCloseResult}
        />
      )}

    </>
  );
}
