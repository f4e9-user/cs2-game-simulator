import type { Buff, Player } from '../types.js';
import type { TournamentSeriesContext } from './tournamentSeries.js';

export function consumeMatchBuffsForScope(
  buffs: Buff[],
  scope: 'series' | 'per-map',
): Buff[] {
  return buffs
    .map((buff) => {
      if (buff.consumeOn !== 'match') return buff;
      if (buff.actionTag !== 'match' && buff.actionTag !== 'all') return buff;
      const matchScope = buff.matchScope ?? 'series';
      if (matchScope !== scope) return buff;
      return { ...buff, remainingUses: buff.remainingUses - 1 };
    })
    .filter((buff) => buff.remainingUses > 0);
}

export function matchBuffsForScope(
  buffs: Buff[],
  scope: 'series' | 'per-map',
): Buff[] {
  return buffs.filter((buff) =>
    buff.remainingUses > 0 &&
    buff.consumeOn === 'match' &&
    (buff.actionTag === 'match' || buff.actionTag === 'all') &&
    (buff.matchScope ?? 'series') === scope
  );
}

export function playerWithSeriesBuffSnapshot(player: Player, context: TournamentSeriesContext): Player {
  const seriesBuffs = context.seriesBuffSnapshot ?? [];
  const perMapBuffs = matchBuffsForScope(player.buffs ?? [], 'per-map');
  const nonMatchBuffs = (player.buffs ?? []).filter((buff) => buff.consumeOn !== 'match');
  return {
    ...player,
    buffs: [...nonMatchBuffs, ...seriesBuffs, ...perMapBuffs],
  };
}
