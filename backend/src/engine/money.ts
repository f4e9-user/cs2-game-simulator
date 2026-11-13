import type { Player, Stats } from '../types.js';
import { MONEY_MAX } from './constants.js';

export function clampMoneyValue(v: number): number {
  return Math.max(0, Math.min(MONEY_MAX, Math.round(v)));
}

export function applyMoneyDeltaToStats(stats: Stats, delta: number): Stats {
  return {
    ...stats,
    money: clampMoneyValue(stats.money + delta),
  };
}

export function applyMoneyTransaction(player: Player, delta: number): number {
  const before = player.stats.money;
  const after = clampMoneyValue(before + delta);
  player.stats = {
    ...player.stats,
    money: after,
  };
  return after - before;
}
